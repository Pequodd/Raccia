import { Platform } from 'react-native';

// Call sounds made on the fly with WebAudio (no files to ship):
//   ring     — incoming call, two quick chirps every two seconds;
//   ringback — the long beeps you hear while the other side rings (425 Hz, 1 s on / 4 s off).
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function beep(freq: number, from: number, length: number, volume = 0.08) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, from);
  gain.gain.exponentialRampToValueAtTime(volume, from + 0.02);
  gain.gain.setValueAtTime(volume, from + length - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, from + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(from);
  osc.stop(from + length + 0.02);
}

function loop(pattern: () => void, everyMs: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  stop();
  try {
    ctx ??= new AudioContext();
    ctx.resume().catch(() => {});
  } catch {
    return;
  }
  pattern();
  timer = setInterval(pattern, everyMs);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export const tones = {
  ring: () =>
    loop(() => {
      const t = ctx!.currentTime;
      beep(880, t, 0.18, 0.1);
      beep(1175, t + 0.22, 0.18, 0.1);
      beep(880, t + 0.6, 0.18, 0.1);
      beep(1175, t + 0.82, 0.18, 0.1);
    }, 2500),
  ringback: () => loop(() => beep(425, ctx!.currentTime, 1, 0.05), 5000),
  stop,
};
