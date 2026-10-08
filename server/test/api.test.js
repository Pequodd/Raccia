import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

const VOTE_MS = 400;
let server, wss, base;

before(async () => {
  ({ server, wss } = createServer(openDb(':memory:'), { voteMs: VOTE_MS }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  for (const ws of wss.clients) ws.terminate();
  await new Promise((r) => server.close(r));
});

async function api(path, { token, body, method } = {}) {
  const res = await fetch(base + path, {
    method: method ?? (body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

function connect(token) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`);
  const events = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const ev = JSON.parse(raw.toString());
    const w = waiters.find((x) => x.type === ev.type);
    if (w) {
      waiters.splice(waiters.indexOf(w), 1);
      w.resolve(ev);
    } else events.push(ev);
  });
  const next = (type) =>
    new Promise((resolve, reject) => {
      const found = events.find((e) => e.type === type);
      if (found) {
        events.splice(events.indexOf(found), 1);
        return resolve(found);
      }
      waiters.push({ type, resolve });
      setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 3000);
    });
  return { ws, next };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function invite(token) {
  return (await api('/api/invites', { token, body: {} })).data.code;
}

async function join(inviterToken, username) {
  const code = await invite(inviterToken);
  return api('/api/register', { body: { username, password: 'secret1', invite: code } });
}

let founder;

test('first user founds Oleg; everyone else needs an invite', async () => {
  founder = await api('/api/register', { body: { username: 'founder', password: 'secret1' } });
  assert.equal(founder.status, 201);
  assert.equal(founder.data.user.status, 'initiated');
  assert.equal(founder.data.user.isAdmin, true);

  const noInvite = await api('/api/register', { body: { username: 'stranger', password: 'secret1' } });
  assert.equal(noInvite.status, 403);

  const code = await invite(founder.data.token);
  assert.deepEqual((await api(`/api/invites/${code}`)).data, { invitedBy: 'founder' });
  const ok = await api('/api/register', { body: { username: 'newbie', password: 'secret1', invite: code } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.user.status, 'candidate');
  assert.equal(ok.data.user.name, `Олег#${ok.data.user.id}`);
  assert.equal(ok.data.user.avatar, 'idea');

  const reused = await api('/api/register', { body: { username: 'second', password: 'secret1', invite: code } });
  assert.equal(reused.status, 403, 'an invite works once');
  assert.equal((await api(`/api/invites/${code}`)).status, 404);

  // The newcomer lands in a chat with the inviter, opened by a service message.
  const chats = (await api('/api/chats', { token: ok.data.token })).data.chats;
  assert.equal(chats.length, 1);
  assert.equal(chats[0].title, 'founder');
  assert.equal(chats[0].lastMessage.kind, 'service');
  await sleep(VOTE_MS + 100); // nobody voted: 0:0 lets the newcomer in
  assert.equal((await api('/api/me', { token: ok.data.token })).data.user.status, 'initiated');
});

test('initiated members vote; majority decides, a tie lets the newcomer in', async () => {
  const ft = founder.data.token;
  const voter = await join(ft, 'voter');
  await sleep(VOTE_MS + 100);
  const vt = voter.data.token;

  const fWs = connect(ft);
  await fWs.next('ready');

  // Rejected: two against, nobody for.
  const bad = await join(ft, 'troll');
  const opened = await fWs.next('vote');
  assert.equal(opened.vote.candidate.id, bad.data.user.id);
  assert.equal(opened.vote.invitedBy.name, 'founder');
  assert.equal(opened.vote.canVote, true);

  // A candidate cannot vote, not even for themselves.
  assert.equal((await api(`/api/votes/${bad.data.user.id}`, { token: bad.data.token, body: { vote: 'for' } })).status, 403);

  await api(`/api/votes/${bad.data.user.id}`, { token: ft, body: { vote: 'for' } });
  await api(`/api/votes/${bad.data.user.id}`, { token: ft, body: { vote: null } }); // changed my mind
  await api(`/api/votes/${bad.data.user.id}`, { token: ft, body: { vote: 'against' } });
  const last = await api(`/api/votes/${bad.data.user.id}`, { token: vt, body: { vote: 'against' } });
  assert.equal(last.data.vote.no, 2);
  assert.equal(last.data.vote.yes, 0);

  let result;
  do result = await fWs.next('vote_result');
  while (result.candidateId !== bad.data.user.id);
  assert.equal(result.accepted, false);
  const troll = (await api('/api/me', { token: bad.data.token })).data.user;
  assert.equal(troll.status, 'rejected');
  assert.equal(troll.name, `Олег#${troll.id}`);

  // Rejected users keep writing and inviting, but not voting or renaming.
  assert.equal((await api('/api/me', { token: bad.data.token, body: { name: 'Тролль' } })).status, 403);
  assert.equal((await join(bad.data.token, 'trollfriend')).status, 201);

  // Tie: one for, one against → in.
  const tie = await join(ft, 'tie');
  await api(`/api/votes/${tie.data.user.id}`, { token: ft, body: { vote: 'for' } });
  await api(`/api/votes/${tie.data.user.id}`, { token: vt, body: { vote: 'against' } });
  do result = await fWs.next('vote_result');
  while (result.candidateId !== tie.data.user.id);
  assert.equal(result.accepted, true);

  fWs.ws.close();
});

test('the initiated choose a name and an avatar', async () => {
  const ft = founder.data.token;
  assert.equal((await api('/api/me', { token: ft, body: { name: 'Олег#3' } })).status, 400);
  assert.equal((await api('/api/me', { token: ft, body: { avatar: 'nope' } })).status, 400);
  const res = await api('/api/me', { token: ft, body: { name: 'Гоша', avatar: 'cool' } });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.name, 'Гоша');
  assert.equal(res.data.user.avatar, 'cool');
  // Login nick is unchanged.
  assert.equal((await api('/api/login', { body: { username: 'founder', password: 'secret1' } })).status, 200);
});

test('chat, real-time delivery and read receipts', async () => {
  const ft = founder.data.token;
  const alice = await join(ft, 'alice');
  const bob = await join(ft, 'bob');
  assert.equal(alice.status, 201);
  const aliceToken = alice.data.token;
  const bobToken = bob.data.token;

  assert.equal((await api('/api/login', { body: { username: 'alice', password: 'wrong!!' } })).status, 401);
  assert.equal((await api('/api/chats')).status, 401);

  const found = await api('/api/users?q=bo', { token: aliceToken });
  assert.deepEqual(found.data.users.map((u) => u.username), ['bob']);

  const bobWs = connect(bobToken);
  await bobWs.next('ready');

  const { data: { chat } } = await api('/api/chats/direct', { token: aliceToken, body: { userId: bob.data.user.id } });
  assert.equal(chat.title, bob.data.user.name);
  const again = await api('/api/chats/direct', { token: aliceToken, body: { userId: bob.data.user.id } });
  assert.equal(again.data.chat.id, chat.id, 'direct chat is reused');
  const chatEvent = await bobWs.next('chat');
  assert.equal(chatEvent.chat.id, chat.id);

  const sent = await api(`/api/chats/${chat.id}/messages`, { token: aliceToken, body: { body: 'Привет!' } });
  assert.equal(sent.status, 201);
  let pushed;
  do pushed = await bobWs.next('message');
  while (pushed.message.chatId !== chat.id);
  assert.equal(pushed.message.body, 'Привет!');
  assert.equal(pushed.message.name, alice.data.user.name);
  let delivered;
  do delivered = await bobWs.next('delivered');
  while (delivered.chatId !== chat.id);
  assert.equal(delivered.userId, bob.data.user.id);

  const bobChat = (await api('/api/chats', { token: bobToken })).data.chats.find((c) => c.id === chat.id);
  assert.equal(bobChat.unread, 1);
  const bobMember = bobChat.members.find((m) => m.id === bob.data.user.id);
  assert.equal(bobMember.lastDeliveredId, pushed.message.id);
  assert.equal(bobMember.lastReadId, 0);
  await api(`/api/chats/${chat.id}/read`, { token: bobToken, body: { messageId: pushed.message.id } });
  const after = (await api('/api/chats', { token: bobToken })).data.chats.find((c) => c.id === chat.id);
  assert.equal(after.unread, 0);

  const history = await api(`/api/chats/${chat.id}/messages`, { token: bobToken });
  assert.deepEqual(history.data.messages.map((m) => m.body), ['Привет!']);

  assert.equal((await api(`/api/chats/${chat.id}/messages`, { token: ft })).status, 404);
  bobWs.ws.close();
});

test('group chats and typing', async () => {
  const ft = founder.data.token;
  const a = await join(ft, 'g_a');
  const b = await join(ft, 'g_b');
  const bWs = connect(b.data.token);
  await bWs.next('ready');

  const group = await api('/api/chats/group', {
    token: a.data.token,
    body: { title: 'Команда', memberIds: [b.data.user.id] },
  });
  assert.equal(group.status, 201);
  assert.equal(group.data.chat.members.length, 2);
  let ev;
  do ev = await bWs.next('chat');
  while (ev.chat.id !== group.data.chat.id);

  const aWs = connect(a.data.token);
  await aWs.next('ready');
  assert.equal((await bWs.next('presence')).online, true);
  aWs.ws.send(JSON.stringify({ type: 'typing', chatId: group.data.chat.id }));
  const typing = await bWs.next('typing');
  assert.equal(typing.name, a.data.user.name);

  aWs.ws.close();
  const presence = await bWs.next('presence');
  assert.equal(presence.online, false);
  bWs.ws.close();
});
