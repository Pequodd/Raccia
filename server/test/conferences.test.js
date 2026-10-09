import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

let server, wss, base;
before(async () => {
  ({ server, wss } = createServer(openDb(':memory:'), {
    graceMs: 100, voteMs: 60_000, push: { send: async () => {} } }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  for (const ws of wss.clients) ws.terminate();
  await new Promise((r) => server.close(r));
});

const api = async (path, token, body) =>
  (await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })).json();

function connect(token) {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${token}`);
  const events = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const ev = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => w.test(ev));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(ev);
    else events.push(ev);
  });
  const next = (type, pred = () => true) =>
    new Promise((resolve, reject) => {
      const test = (e) => e.type === type && pred(e);
      const i = events.findIndex(test);
      if (i >= 0) return resolve(events.splice(i, 1)[0]);
      waiters.push({ test, resolve });
      setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 3000);
    });
  return { ws, next, send: (d) => ws.send(JSON.stringify(d)), open: new Promise((r) => ws.on('open', r)) };
}

test('conference: start in a group, invite, join, relay, screen, leave, card', async () => {
  const a = await api('/api/register', null, { username: 'anya', password: 'secret1' });
  const users = [];
  for (const name of ['boris', 'vera']) {
    const { code } = await api('/api/invites', a.token, {});
    users.push(await api('/api/register', null, { username: name, password: 'secret1', invite: code }));
  }
  const [b, v] = users;
  const group = (await api('/api/chats/group', a.token, { title: 'Туса', memberIds: [b.user.id, v.user.id] })).chat.id;
  const A = connect(a.token), B = connect(b.token), V = connect(v.token);
  await Promise.all([A.open, B.open, V.open]);

  A.send({ type: 'conf_start', chatId: group, video: true });
  const joinedA = await A.next('conf_joined');
  assert.deepEqual(joinedA.peers, []);
  assert.equal(joinedA.conf.title, 'Туса');
  const confId = joinedA.conf.id;
  const invite = await B.next('conf_invite');
  assert.equal(invite.conf.host.name, 'anya');
  const card = await B.next('message', (e) => e.message.kind === 'conference');
  assert.equal(card.message.conference.active, true);

  B.send({ type: 'conf_join', confId });
  const joinedB = await B.next('conf_joined');
  assert.deepEqual(joinedB.peers.map((p) => p.name), ['anya']);
  assert.equal((await A.next('conf_peer_joined')).peer.id, b.user.id);
  const update = await V.next('message_update', (e) => e.message.conference?.people.length === 2);
  assert.ok(update);

  // Signals go to the named peer only.
  B.send({ type: 'conf_signal', confId, to: a.user.id, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
  const sig = await A.next('conf_signal');
  assert.equal(sig.from, b.user.id);

  // Starting again in the same chat joins the running one.
  V.send({ type: 'conf_start', chatId: group, video: false });
  assert.equal((await V.next('conf_joined')).conf.id, confId);

  B.send({ type: 'conf_screen', confId, on: true });
  assert.equal((await A.next('conf_screen')).on, true);

  // Everyone leaves (Vera by closing the app): the card says it is over.
  B.send({ type: 'conf_leave', confId });
  await A.next('conf_peer_left', (e) => e.userId === b.user.id);
  V.ws.close();
  await A.next('conf_peer_left', (e) => e.userId === v.user.id);
  A.send({ type: 'conf_leave', confId });
  const over = await B.next('message_update', (e) => e.message.conference && !e.message.conference.active);
  assert.ok(over.message.conference.duration >= 0);

  // Joining a finished conference fails politely.
  B.send({ type: 'conf_join', confId });
  assert.match((await B.next('conf_error')).error, /закончилась/);
  A.ws.close();
  B.ws.close();
});

test('a stale seat from another tab does not close the new conference', async () => {
  const a = await api('/api/login', null, { username: 'anya', password: 'secret1' });
  const chats = (await api('/api/chats', a.token)).chats;
  const direct = chats.find((c) => c.type === 'direct').id;
  const group = chats.find((c) => c.type === 'group').id;
  const tab1 = connect(a.token);
  const tab2 = connect(a.token);
  await Promise.all([tab1.open, tab2.open]);

  // Tab 1 starts a conference and is closed without «Выйти»; tab 2 stays open.
  tab1.send({ type: 'conf_start', chatId: group, video: true });
  const first = await tab1.next('conf_joined');
  tab1.ws.close();
  await new Promise((r) => setTimeout(r, 100));

  // Tab 2 starts another one: it opens and stays, no «you left» for it.
  tab2.send({ type: 'conf_start', chatId: direct, video: true });
  const second = await tab2.next('conf_joined');
  assert.notEqual(second.conf.id, first.conf.id);
  await new Promise((r) => setTimeout(r, 100));
  await assert.rejects(tab2.next('conf_left', (e) => e.confId === second.conf.id));

  // Starting in the same chat again re-joins instead of hanging on «Подключаемся».
  tab2.send({ type: 'conf_start', chatId: direct, video: true });
  assert.equal((await tab2.next('conf_joined')).conf.id, second.conf.id);
  tab2.ws.close();
});

test('the conference has its own chat, not the chat it was started in', async () => {
  const a = await api('/api/login', null, { username: 'anya', password: 'secret1' });
  const b = await api('/api/login', null, { username: 'boris', password: 'secret1' });
  const group = (await api('/api/chats', a.token)).chats.find((c) => c.type === 'group').id;
  const A = connect(a.token), B = connect(b.token);
  await Promise.all([A.open, B.open]);
  A.send({ type: 'conf_start', chatId: group, video: false });
  const confId = (await A.next('conf_joined')).conf.id;
  A.send({ type: 'conf_chat', confId, text: 'Включай фильм!' });
  assert.equal((await A.next('conf_chat')).message.text, 'Включай фильм!');

  // A latecomer gets the history; the group chat itself stays untouched (only the card).
  B.send({ type: 'conf_join', confId });
  const joined = await B.next('conf_joined');
  assert.deepEqual(joined.chat.map((m) => m.text), ['Включай фильм!']);
  B.send({ type: 'conf_chat', confId, text: 'Уже!' });
  assert.equal((await A.next('conf_chat')).message.userId, b.user.id);
  const after = (await api(`/api/chats/${group}/messages`, a.token)).messages;
  assert.ok(!after.some((m) => m.body === 'Включай фильм!' || m.body === 'Уже!'));
  A.send({ type: 'conf_leave', confId });
  B.send({ type: 'conf_leave', confId });
  A.ws.close();
  B.ws.close();
});
