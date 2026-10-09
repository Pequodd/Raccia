import { spawn, spawnSync } from 'node:child_process';
import { renameSync, unlinkSync } from 'node:fs';

// Some browsers record WebM/Opus/VP9, some phones shoot HEVC — and iPhones can't play
// the first, older Androids the second. If ffmpeg is on the server, such files are turned
// into H.264 + AAC, which plays everywhere. Without ffmpeg the original is kept.

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
export const transcodingAvailable = hasFfmpeg;

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err}`));
    });
  });
}

async function codecs(path) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'csv=p=0', path], 30_000);
  const list = out.trim().split('\n').map((l) => l.split(','));
  return {
    video: list.find((s) => s.includes('video'))?.[0] ?? null,
    audio: list.find((s) => s.includes('audio'))?.[0] ?? null,
  };
}

const VIDEO_OK = ['h264'];
const AUDIO_OK = ['aac', 'mp3'];

// path: the saved file. Returns the new path (with a new extension) or the same one.
export async function makePlayable(path, kind) {
  if (!hasFfmpeg || kind === 'image') return path;
  let c;
  try {
    c = await codecs(path);
  } catch {
    return path;
  }
  const audioOk = !c.audio || AUDIO_OK.includes(c.audio);
  const videoOk = !c.video || VIDEO_OK.includes(c.video);
  if (kind === 'voice' ? audioOk : audioOk && videoOk) return path;

  const base = path.replace(/\.[^.]+$/, '');
  const out = `${base}.${kind === 'voice' ? 'm4a' : 'mp4'}`;
  const tmp = `${base}.tmp.${kind === 'voice' ? 'm4a' : 'mp4'}`;
  const audio = ['-c:a', 'aac', '-b:a', kind === 'voice' ? '64k' : '96k'];
  const args =
    kind === 'voice'
      ? ['-i', path, '-vn', ...audio]
      : [
          '-i', path,
          // Circles: a 480×480 square. Videos: no bigger than 1280 on the long side.
          '-vf', kind === 'circle'
            ? "crop='min(iw,ih)':'min(iw,ih)',scale=480:480"
            : "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
          '-c:v', 'libx264', '-preset', 'veryfast', '-crf', kind === 'circle' ? '28' : '26',
          '-pix_fmt', 'yuv420p', '-profile:v', 'main',
          ...(c.audio ? audio : ['-an']),
        ];
  try {
    await run('ffmpeg', ['-y', '-v', 'error', ...args, '-movflags', '+faststart', tmp], kind === 'video' ? 10 * 60_000 : 2 * 60_000);
    renameSync(tmp, out);
    if (out !== path) unlinkSync(path);
    return out;
  } catch (err) {
    console.warn('transcode failed, keeping the original:', err.message.slice(0, 300));
    try {
      unlinkSync(tmp);
    } catch {
      // nothing to clean
    }
    return path;
  }
}


// First frame as a JPEG cover for videos and circles: phones show black until playback
// otherwise. Returns the cover's path or null.
export async function makePoster(path) {
  if (!hasFfmpeg) return null;
  const out = path.replace(/\.[^.]+$/, '.jpg');
  try {
    await run('ffmpeg', ['-y', '-v', 'error', '-ss', '0.1', '-i', path, '-frames:v', '1', '-vf', "scale='min(640,iw)':-2", '-q:v', '4', out], 60_000);
    return out;
  } catch {
    return null;
  }
}

// Length in ms, for files whose sender could not tell (web gallery videos, WebM recordings).
export async function probeDuration(path) {
  if (!hasFfmpeg) return null;
  try {
    const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], 30_000);
    const ms = Math.round(Number(out.trim()) * 1000);
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
}
