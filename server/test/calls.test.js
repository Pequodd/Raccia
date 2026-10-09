import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

let server, wss, base;
const pushed = [];
before(async () => {
  ({ server, wss } = createServer(openDb(':memory:'), {
    voteMs: 60_000,
    push: { send: async (_sub, data) => pushed.push(JSON.parse(data)) },
    turn: { turnHost: 'oleg.test', turnSecret: 'sekret' },
  }));
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
    const i = waiters.findIndex((w) => w.type === ev.type);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(ev);
    else events.push(ev);
  });
  const next = (type) =>
    new Promise((resolve, reject) => {
      const i = events.findIndex((e) => e.type === type);
      if (i >= 0) return resolve(events.splice(i, 1)[0]);
      waiters.push({ type, resolve });
      setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 3000);
    });
  const send = (data) => ws.send(JSON.stringify(data));
  return { ws, next, send, open: new Promise((r) => ws.on('open', r)) };
}

test('calls: ring, accept, relay signals, hang up, log in chat', async () => {
  const a = await api('/api/register', null, { username: 'anya', password: 'secret1' });
  const { code } = await api('/api/invites', a.token, {});
  const b = await api('/api/register', null, { username: 'boris', password: 'secret1', invite: code });
  const chatId = (await api('/api/chats', a.token)).chats[0].id;

  const ice = (await api('/api/turn', a.token)).iceServers;
  assert.equal(ice[0].urls, 'stun:oleg.test:3478');
  assert.ok(ice[1].username.endsWith(`:${a.user.id}`) && ice[1].credential);

  const A = connect(a.token);
  const B = connect(b.token);
  await Promise.all([A.open, B.open]);

  A.send({ type: 'call_invite', chatId, video: true });
  const ringing = await A.next('call_ringing');
  const incoming = await B.next('call_incoming');
  assert.equal(incoming.call.id, ringing.call.id);
  assert.equal(incoming.call.video, true);
  assert.equal(incoming.call.from.name, 'anya');
  const callId = ringing.call.id;

  // Busy while the call rings.
  A.send({ type: 'call_invite', chatId, video: false });
  await A.next('call_busy');

  B.send({ type: 'call_accept', callId });
  await A.next('call_accepted');
  A.send({ type: 'call_signal', callId, data: { sdp: { type: 'offer', sdp: 'v=0' } } });
  assert.equal((await B.next('call_signal')).data.sdp.type, 'offer');
  B.send({ type: 'call_signal', callId, data: { candidate: { candidate: 'x' } } });
  assert.equal((await A.next('call_signal')).data.candidate.candidate, 'x');

  B.send({ type: 'call_hangup', callId });
  assert.equal((await A.next('call_ended')).outcome, 'ended');
  assert.equal((await B.next('call_ended')).outcome, 'ended');
  const log = await A.next('message');
  assert.equal(log.message.kind, 'call');
  assert.match(log.message.body, /^Видеозвонок · 0:0\d$/);
  assert.equal(log.message.media.outcome, 'ended');

  // A missed call: Boris is not looking — he gets a push, then «Пропущенный».
  B.send({ type: 'visibility', visible: false });
  await api('/api/push/subscribe', b.token, { subscription: { endpoint: 'https://push.example/b', keys: { p256dh: 'x'.repeat(80), auth: 'y'.repeat(20) } } });
  A.send({ type: 'call_invite', chatId, video: false });
  const second = (await A.next('call_ringing')).call.id;
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(pushed.some((p) => p.body === '📞 Входящий звонок' && p.url === `/?chat=${chatId}`));
  A.send({ type: 'call_hangup', callId: second });
  assert.equal((await B.next('call_ended')).outcome, 'canceled');

  // Strangers cannot hijack a call; group chats cannot ring.
  const group = (await api('/api/chats/group', a.token, { title: 'Туса', memberIds: [b.user.id] })).chat.id;
  A.send({ type: 'call_invite', chatId: group, video: false });
  assert.match((await A.next('call_error')).error, /личном/);

  A.ws.close();
  B.ws.close();
});
