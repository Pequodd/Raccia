import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

let server, wss, base;
before(async () => {
  ({ server, wss } = createServer(openDb(':memory:'), { voteMs: 60_000, push: { send: async () => {} } }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(async () => {
  for (const ws of wss.clients) ws.terminate();
  await new Promise((r) => server.close(r));
});

const api = async (path, token, body) => {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
};

test('сходка: bars, meetup card, answers', async () => {
  const admin = (await api('/api/register', null, { username: 'admin', password: 'secret1' })).data;
  const { code } = (await api('/api/invites', admin.token, {})).data;
  const friend = (await api('/api/register', null, { username: 'friend', password: 'secret1', invite: code })).data;
  const chatId = (await api('/api/chats', admin.token)).data.chats[0].id;

  // Only the super-admin keeps the bar list.
  assert.equal((await api('/api/bars', friend.token, { name: 'Бар' })).status, 403);
  let r = await api('/api/bars', admin.token, { name: 'Бар «Тест»', address: 'ул. Кирова, 1', phone: '+7 (351) 000-00-00' });
  assert.equal(r.status, 201);
  const bar = r.data.bar;
  assert.match(bar.mapUrl, /^https:\/\/yandex\.ru\/maps\/56\/chelyabinsk\/\?text=/);
  assert.equal((await api('/api/bars', admin.token, { name: 'X', phone: 'звоните' })).status, 400);
  assert.equal((await api('/api/bars', friend.token)).data.bars.length, 1);

  // The friend proposes a meetup; the admin watches over a socket.
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${admin.token}`);
  const events = [];
  ws.on('message', (raw) => events.push(JSON.parse(raw.toString())));
  await new Promise((res) => ws.on('open', res));
  const startsAt = Date.now() + 2 * 3600_000;
  r = await api(`/api/chats/${chatId}/meetups`, friend.token, { barId: bar.id, startsAt });
  assert.equal(r.status, 201);
  const msg = r.data.message;
  assert.equal(msg.kind, 'meetup');
  assert.equal(msg.meetup.place.name, 'Бар «Тест»');
  assert.equal(msg.meetup.place.phone, '+7 (351) 000-00-00');
  assert.equal(msg.meetup.undecided, 2);
  assert.match(msg.body, /^Бар «Тест» · /);

  // Free-text place, and bad times.
  r = await api(`/api/chats/${chatId}/meetups`, admin.token, { place: { name: 'К Васе на дачу' }, startsAt });
  assert.equal(r.data.message.meetup.place.phone, null);
  assert.equal((await api(`/api/chats/${chatId}/meetups`, admin.token, { place: { name: 'x' }, startsAt: 1 })).status, 400);

  // Answers
  r = await api(`/api/meetups/${msg.meetup.id}/answer`, admin.token, { answer: 'yes' });
  assert.deepEqual(r.data.message.meetup.going.map((u) => u.name), ['admin']);
  r = await api(`/api/meetups/${msg.meetup.id}/answer`, friend.token, { answer: 'no' });
  assert.equal(r.data.message.meetup.undecided, 0);
  r = await api(`/api/meetups/${msg.meetup.id}/answer`, friend.token, { answer: null });
  assert.equal(r.data.message.meetup.undecided, 1);
  await new Promise((res) => setTimeout(res, 50));
  assert.ok(events.some((e) => e.type === 'meetup' && e.message.id === msg.id));

  // History keeps the card; a deleted bar does not break it.
  await api(`/api/bars/${bar.id}/delete`, admin.token, {});
  const history = (await api(`/api/chats/${chatId}/messages`, admin.token)).data.messages;
  assert.equal(history.find((m) => m.id === msg.id).meetup.place.name, 'Бар «Тест»');
  ws.close();
});

test('forwarding keeps the original author and the attachment', async () => {
  const u = (await api('/api/login', null, { username: 'admin', password: 'secret1' })).data;
  const f = (await api('/api/login', null, { username: 'friend', password: 'secret1' })).data;
  const chats = (await api('/api/chats', u.token)).data.chats;
  const direct = chats[0].id;
  const group = (await api('/api/chats/group', u.token, { title: 'Туса', memberIds: [f.user.id] })).data.chat.id;
  const original = (await api(`/api/chats/${direct}/messages`, f.token, { body: 'ключи на гвоздике' })).data.message;

  let r = await api(`/api/messages/${original.id}/forward`, u.token, { chatIds: [group] });
  assert.equal(r.status, 201);
  const fwd = r.data.messages[0];
  assert.equal(fwd.body, 'ключи на гвоздике');
  assert.equal(fwd.userId, u.user.id);
  assert.equal(fwd.forwardedFrom, f.user.name); // a candidate: «Олег#2»

  // Forwarding a forward keeps the first author.
  r = await api(`/api/messages/${fwd.id}/forward`, f.token, { chatIds: [direct] });
  assert.equal(r.data.messages[0].forwardedFrom, f.user.name);

  // Not into chats you are not in, not service lines, not nothing.
  const other = (await api('/api/chats/group', u.token, { title: 'Только я', memberIds: [] })).data.chat.id;
  assert.equal((await api(`/api/messages/${original.id}/forward`, f.token, { chatIds: [other] })).status, 404);
  assert.equal((await api(`/api/messages/${original.id}/forward`, f.token, { chatIds: [] })).status, 400);
  const service = (await api(`/api/chats/${direct}/messages`, u.token)).data.messages.find((m) => m.kind === 'service');
  assert.equal((await api(`/api/messages/${service.id}/forward`, u.token, { chatIds: [group] })).status, 400);
});
