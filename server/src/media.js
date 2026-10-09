import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, openSync, readSync, closeSync, statSync, unlinkSync, renameSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { makePlayable, makePoster, probeDuration } from './transcode.js';

// Attachments: photos, videos, voice messages and video circles.
// Files go to <uploadDir>/m/ under random names and are served from /media/m/<file>.

const MB = 1024 * 1024;
export const MEDIA_KINDS = {
  image: { max: 20 * MB, containers: ['jpg', 'png', 'webp', 'gif'] },
  video: { max: 100 * MB, containers: ['mp4', 'webm'] },
  voice: { max: 15 * MB, containers: ['mp4', 'webm', 'ogg', 'mp3', 'aac'] },
  circle: { max: 40 * MB, containers: ['mp4', 'webm'] },
};

// What a file really is, by its first bytes. Clients lie about Content-Type
// (and iOS calls its videos «quicktime»), so the extension comes from here.
export function sniff(buf) {
  const ascii = (a, b) => buf.toString('ascii', a, b);
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  if (ascii(0, 4) === 'GIF8') return 'gif';
  if (ascii(4, 8) === 'ftyp') return 'mp4'; // mp4, mov, m4a
  if (buf.readUInt32BE(0) === 0x1a45dfa3) return 'webm';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe6) === 0xe2)) return 'mp3';
  if (buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0) return 'aac';
  return null;
}

// The file name tells the browser the type (express.static), so pick a fitting extension.
function extension(kind, container) {
  if (kind === 'voice' && container === 'mp4') return 'm4a';
  if (kind === 'voice' && container === 'webm') return 'weba';
  return container;
}

export class MediaError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Stream the request body to disk (never the whole video in memory), then check it.
export async function saveMedia(req, uploadDir, kind) {
  const spec = MEDIA_KINDS[kind];
  if (!spec) throw new MediaError('kind: image, video, voice или circle');
  const declared = Number(req.get('content-length'));
  if (declared > spec.max) throw new MediaError(`Файл больше ${Math.round(spec.max / MB)} МБ`, 413);

  const dir = join(uploadDir, 'm');
  mkdirSync(dir, { recursive: true });
  const name = randomBytes(12).toString('hex');
  const tmp = join(dir, `${name}.part`);
  let size = 0;
  const limit = new Transform({
    transform(chunk, _enc, done) {
      size += chunk.length;
      if (size > spec.max) done(new MediaError(`Файл больше ${Math.round(spec.max / MB)} МБ`, 413));
      else done(null, chunk);
    },
  });
  try {
    await pipeline(req, limit, createWriteStream(tmp));
  } catch (err) {
    safeUnlink(tmp);
    throw err instanceof MediaError ? err : new MediaError('Загрузка оборвалась, попробуйте ещё раз');
  }

  const head = Buffer.alloc(16);
  const fd = openSync(tmp, 'r');
  readSync(fd, head, 0, 16, 0);
  closeSync(fd);
  const container = sniff(head);
  if (!container || !spec.containers.includes(container)) {
    safeUnlink(tmp);
    throw new MediaError(kind === 'image' ? 'Нужна картинка JPEG, PNG, WebP или GIF' : 'Не тот формат файла');
  }
  const saved = join(dir, `${name}.${extension(kind, container)}`);
  renameSync(tmp, saved);
  const playable = await makePlayable(saved, kind);
  const poster = kind === 'video' || kind === 'circle' ? await makePoster(playable) : null;
  return {
    file: `m/${basename(playable)}`,
    size: statSync(playable).size,
    probedDuration: kind === 'image' ? null : await probeDuration(playable),
    ...(poster ? { poster: `m/${basename(poster)}` } : {}),
  };
}

function safeUnlink(path) {
  try {
    unlinkSync(path);
  } catch {
    // already gone
  }
}
