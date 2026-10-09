import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { createServer } from '../src/app.js';

let server, wss, base, uploadDir;
const pushed = [];

before(async () => {
  uploadDir = mkdtempSync(join(tmpdir(), 'oleg-media-'));
  const send = async (sub, data) => pushed.push(JSON.parse(data));
  ({ server, wss } = createServer(openDb(':memory:'), { voteMs: 60_000, uploadDir, push: { send } }));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  for (const ws of wss.clients) ws.terminate();
  await new Promise((r) => server.close(r));
  rmSync(uploadDir, { recursive: true, force: true });
});

const json = async (path, token, body) =>
  (await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })).json();

const upload = (chatId, token, query, bytes, type) =>
  fetch(`${base}/api/chats/${chatId}/media?${new URLSearchParams(query)}`, {
    method: 'POST',
    headers: { 'Content-Type': type, Authorization: `Bearer ${token}` },
    body: bytes,
  });

const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(200, 7)]);
const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 3)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

test('attachments: photo, video, voice, circle', async () => {
  const a = await (await fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alice', password: 'secret1' }),
  })).json();
  const { code } = await json('/api/invites', a.token, {});
  const b = await (await fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'bob', password: 'secret1', invite: code }),
  })).json();
  await json('/api/push/subscribe', a.token, { subscription: { endpoint: 'https://push.example/a', keys: { p256dh: 'x'.repeat(80), auth: 'y'.repeat(20) } } });
  const chatId = (await json('/api/chats', b.token)).chats[0].id;

  let r = await upload(chatId, b.token, { kind: 'image', width: 800, height: 600, caption: 'дача' }, jpeg, 'image/jpeg');
  assert.equal(r.status, 201);
  let { message } = await r.json();
  assert.equal(message.kind, 'image');
  assert.equal(message.body, 'дача');
  assert.match(message.media.file, /^m\/[0-9a-f]{24}\.jpg$/);
  assert.equal(message.media.width, 800);
  const got = await fetch(`${base}/media/${message.media.file}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/jpeg');

  // iOS sends videos as quicktime: the bytes decide.
  r = await upload(chatId, b.token, { kind: 'video', duration: 3000 }, mp4, 'video/quicktime');
  message = (await r.json()).message;
  assert.match(message.media.file, /\.mp4$/);
  assert.equal(message.media.duration, 3000);

  r = await upload(chatId, b.token, { kind: 'voice', duration: 4200 }, mp4, 'audio/mp4');
  message = (await r.json()).message;
  assert.match(message.media.file, /\.m4a$/);
  const voice = await fetch(`${base}/media/${message.media.file}`, { headers: { Range: 'bytes=0-9' } });
  assert.equal(voice.status, 206); // range requests: needed by Safari for audio/video

  r = await upload(chatId, b.token, { kind: 'circle', duration: 8000 }, webm, 'video/webm;codecs=vp9');
  assert.equal(r.status, 201);

  // Wrong content for the kind, unknown kind, outsiders.
  assert.equal((await upload(chatId, b.token, { kind: 'image' }, mp4, 'image/jpeg')).status, 400);
  assert.equal((await upload(chatId, b.token, { kind: 'sticker' }, jpeg, 'image/jpeg')).status, 400);
  const { code: code2 } = await json('/api/invites', a.token, {});
  const c = await (await fetch(base + '/api/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'carol', password: 'secret1', invite: code2 }),
  })).json();
  assert.equal((await upload(chatId, c.token, { kind: 'image' }, jpeg, 'image/jpeg')).status, 404);

  // No leftovers from rejected uploads.
  assert.ok(readdirSync(join(uploadDir, 'm')).every((f) => !f.endsWith('.part')));

  // Push and the chat list say what it was.
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(pushed.some((p) => p.body === '📷 Фото · дача'));
  assert.ok(pushed.some((p) => p.body === '🎤 Голосовое'));
  const chat = (await json('/api/chats', a.token)).chats.find((x) => x.id === chatId);
  assert.equal(chat.lastMessage.kind, 'circle');
  assert.equal(chat.unread, 4); // the four attachments; the service line does not count
});
