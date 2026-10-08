import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

let server, wss, base;

before(async () => {
  ({ server, wss } = createServer(openDb(':memory:')));
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
    events.push(ev);
    for (const w of [...waiters]) if (w.match(ev)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(ev); }
  });
  const next = (type) =>
    new Promise((resolve, reject) => {
      const found = events.find((e) => e.type === type);
      if (found) { events.splice(events.indexOf(found), 1); return resolve(found); }
      const w = { match: (e) => e.type === type, resolve: (e) => { events.splice(events.indexOf(e), 1); resolve(e); } };
      waiters.push(w);
      setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 2000);
    });
  return { ws, next };
}

test('register, login, chat and real-time delivery', async () => {
  const alice = await api('/api/register', { body: { username: 'alice', password: 'secret1' } });
  assert.equal(alice.status, 201);
  const bob = await api('/api/register', { body: { username: 'bob', password: 'secret2' } });
  assert.equal(bob.status, 201);

  assert.equal((await api('/api/register', { body: { username: 'Alice', password: 'secret1' } })).status, 409);
  assert.equal((await api('/api/login', { body: { username: 'alice', password: 'wrong!!' } })).status, 401);
  const login = await api('/api/login', { body: { username: 'alice', password: 'secret1' } });
  assert.equal(login.status, 200);
  const aliceToken = login.data.token;
  const bobToken = bob.data.token;

  assert.equal((await api('/api/chats')).status, 401);

  const found = await api('/api/users?q=bo', { token: aliceToken });
  assert.deepEqual(found.data.users.map((u) => u.username), ['bob']);

  const bobWs = connect(bobToken);
  await bobWs.next('ready');

  const { data: { chat } } = await api('/api/chats/direct', { token: aliceToken, body: { userId: bob.data.user.id } });
  assert.equal(chat.title, 'bob');
  const again = await api('/api/chats/direct', { token: aliceToken, body: { userId: bob.data.user.id } });
  assert.equal(again.data.chat.id, chat.id, 'direct chat is reused');
  const chatEvent = await bobWs.next('chat');
  assert.equal(chatEvent.chat.title, 'alice');

  const sent = await api(`/api/chats/${chat.id}/messages`, { token: aliceToken, body: { body: 'Привет!' } });
  assert.equal(sent.status, 201);
  const pushed = await bobWs.next('message');
  assert.equal(pushed.message.body, 'Привет!');
  assert.equal(pushed.message.username, 'alice');
  const delivered = await bobWs.next('delivered');
  assert.equal(delivered.userId, bob.data.user.id);
  assert.equal(delivered.messageId, pushed.message.id);

  const bobChats = await api('/api/chats', { token: bobToken });
  assert.equal(bobChats.data.chats[0].unread, 1);
  const bobMember = bobChats.data.chats[0].members.find((m) => m.id === bob.data.user.id);
  assert.equal(bobMember.lastDeliveredId, pushed.message.id);
  assert.equal(bobMember.lastReadId, 0);
  await api(`/api/chats/${chat.id}/read`, { token: bobToken, body: { messageId: pushed.message.id } });
  assert.equal((await api('/api/chats', { token: bobToken })).data.chats[0].unread, 0);

  const history = await api(`/api/chats/${chat.id}/messages`, { token: bobToken });
  assert.deepEqual(history.data.messages.map((m) => m.body), ['Привет!']);

  const carol = await api('/api/register', { body: { username: 'carol', password: 'secret3' } });
  assert.equal((await api(`/api/chats/${chat.id}/messages`, { token: carol.data.token })).status, 404);

  bobWs.ws.close();
});

test('group chats and typing', async () => {
  const a = await api('/api/register', { body: { username: 'g_a', password: 'secret1' } });
  const b = await api('/api/register', { body: { username: 'g_b', password: 'secret1' } });
  const bWs = connect(b.data.token);
  await bWs.next('ready');

  const group = await api('/api/chats/group', {
    token: a.data.token,
    body: { title: 'Команда', memberIds: [b.data.user.id] },
  });
  assert.equal(group.status, 201);
  assert.equal(group.data.chat.members.length, 2);
  await bWs.next('chat');

  const aWs = connect(a.data.token);
  await aWs.next('ready');
  assert.equal((await bWs.next('presence')).online, true);
  aWs.ws.send(JSON.stringify({ type: 'typing', chatId: group.data.chat.id }));
  const typing = await bWs.next('typing');
  assert.equal(typing.username, 'g_a');

  aWs.ws.close();
  const presence = await bWs.next('presence');
  assert.equal(presence.online, false);
  bWs.ws.close();
});
