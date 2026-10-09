import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

let server, wss, base, uploadDir;
const pushed = []; // [{ endpoint, payload }] — the fake push service

before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'oleg-uploads-'));
  const send = async (sub, data) => pushed.push({ endpoint: sub.endpoint, payload: JSON.parse(data) });
  ({ server, wss } = createServer(openDb(':memory:'), { voteMs: 300, uploadDir, push: { send } }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  for (const ws of wss.clients) ws.terminate();
  await new Promise((r) => server.close(r));
  rmSync(uploadDir, { recursive: true, force: true });
});

async function api(path, { token, body, raw, type } = {}) {
  const res = await fetch(base + path, {
    method: body || raw ? 'POST' : 'GET',
    headers: {
      'Content-Type': type ?? 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, data: await res.json().catch(() => null), res };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The smallest valid-looking JPEG header is enough: the server checks magic bytes only.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const SUB = (n) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) } });

test('profile: bio, photo upload, onboarding, push subscriptions', async () => {
  const founder = (await api('/api/register', { body: { username: 'founder', password: 'secret1' } })).data;
  assert.equal(founder.user.onboarded, false);
  assert.equal(founder.user.push, false);
  assert.equal(founder.user.invitedCount, 0);
  assert.ok(founder.user.joinedAt > 0);

  // Bio
  let r = await api('/api/me', { token: founder.token, body: { bio: '  Основал Олега  ' } });
  assert.equal(r.data.user.bio, 'Основал Олега');
  r = await api('/api/me', { token: founder.token, body: { bio: 'x'.repeat(141) } });
  assert.equal(r.status, 400);

  // Photo: not before upload, rejects non-images, then works.
  r = await api('/api/me', { token: founder.token, body: { avatar: 'photo' } });
  assert.equal(r.status, 400);
  r = await api('/api/me/photo', { token: founder.token, raw: Buffer.from('not an image'), type: 'image/jpeg' });
  assert.equal(r.status, 400);
  r = await api('/api/me/photo', { token: founder.token, raw: JPEG, type: 'image/jpeg' });
  assert.equal(r.status, 201);
  const avatar = r.data.user.avatar;
  assert.match(avatar, /^photo:1-[0-9a-f]+\.jpg$/);
  const file = avatar.slice('photo:'.length);
  const media = await fetch(`${base}/media/${file}`);
  assert.equal(media.status, 200);
  assert.equal(Buffer.from(await media.arrayBuffer()).length, JPEG.length);

  // A new photo replaces the old file; switching to a sticker keeps the photo for later.
  r = await api('/api/me/photo', { token: founder.token, raw: JPEG, type: 'image/jpeg' });
  assert.ok(!existsSync(join(uploadDir, file)));
  r = await api('/api/me', { token: founder.token, body: { avatar: 'cool' } });
  assert.equal(r.data.user.avatar, 'cool');
  r = await api('/api/me', { token: founder.token, body: { avatar: 'photo' } });
  assert.match(r.data.user.avatar, /^photo:/);

  // Onboarding flag
  r = await api('/api/me/onboarded', { token: founder.token, body: {} });
  assert.equal(r.data.user.onboarded, true);

  // Push subscription
  assert.equal((await api('/api/push/key')).data.publicKey.length > 40, true);
  r = await api('/api/push/subscribe', { token: founder.token, body: { subscription: { endpoint: 'http://evil' } } });
  assert.equal(r.status, 400);
  r = await api('/api/push/subscribe', { token: founder.token, body: { subscription: SUB('founder') } });
  assert.equal(r.status, 200);
  assert.equal((await api('/api/me', { token: founder.token })).data.user.push, true);

  // A newcomer: founder (offline) gets a push about the vote and about the message.
  const code = (await api('/api/invites', { token: founder.token, body: {} })).data.code;
  const newbie = (await api('/api/register', { body: { username: 'newbie', password: 'secret1', invite: code } })).data;
  await sleep(50);
  assert.ok(pushed.some((p) => p.endpoint.endsWith('/founder') && p.payload.title === 'Новый абонент!'));
  assert.ok(pushed.some((p) => p.endpoint.endsWith('/founder') && p.payload.tag.startsWith('chat-')));

  // Candidates cannot upload photos.
  r = await api('/api/me/photo', { token: newbie.token, raw: JPEG, type: 'image/jpeg' });
  assert.equal(r.status, 403);

  // Founder looks at the newcomer's card.
  r = await api(`/api/users/${newbie.user.id}`, { token: founder.token });
  assert.equal(r.data.user.invitedBy.username, 'founder');
  assert.equal(r.data.user.bio, null);
  r = await api(`/api/users/${founder.user.id}`, { token: newbie.token });
  assert.equal(r.data.user.invitedCount, 1);

  // While the founder has Oleg open and visible, no push; hidden tab → push again.
  const ws = new WebSocket(`${base.replace('http', 'ws')}/ws?token=${founder.token}`);
  await new Promise((r) => ws.on('open', r));
  const chatId = (await api('/api/chats', { token: newbie.token })).data.chats[0].id;
  pushed.length = 0;
  await api(`/api/chats/${chatId}/messages`, { token: newbie.token, body: { body: 'привет' } });
  await sleep(50);
  assert.equal(pushed.length, 0);
  ws.send(JSON.stringify({ type: 'visibility', visible: false }));
  await sleep(50);
  await api(`/api/chats/${chatId}/messages`, { token: newbie.token, body: { body: 'ау' } });
  await sleep(50);
  assert.deepEqual(pushed.map((p) => p.payload.body), ['ау']);
  ws.close();

  // The candidate learns the result by push.
  await api('/api/push/subscribe', { token: newbie.token, body: { subscription: SUB('newbie') } });
  await sleep(400);
  assert.ok(pushed.some((p) => p.endpoint.endsWith('/newbie') && p.payload.title === 'Тебя впустили!'));

  // Unsubscribe
  await api('/api/push/unsubscribe', { token: founder.token, body: { endpoint: SUB('founder').endpoint } });
  assert.equal((await api('/api/me', { token: founder.token })).data.user.push, false);
});
