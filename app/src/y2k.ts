// Skin-independent helpers. Colours, fonts and copy live in src/skins.
import type { Gradient, Skin } from './skins';

// CSS 160deg ≈ top-left → bottom-right, mostly downward.
export const diagonal = { start: { x: 0.33, y: 0 }, end: { x: 0.67, y: 1 } };


export function avatarGradient(seed: string, skin: Skin): Gradient {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return skin.avatars[h % skin.avatars.length];
}

// Initials: first letters of the first two words («Семейная тусовка» → «СТ»).
export function initials(name: string) {
  const words = name.replace(/[«»"]/g, '').split(/[\s_]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 1);
  return letters.toUpperCase();
}

// Dark text on light lollipops (lime), white elsewhere.
export function avatarTextColor(gradient: Gradient, skin: Skin) {
  return gradient[0] === skin.plastic.lime[0] ? skin.colors.limeText : skin.colors.white;
}

// Pale author colours for names inside bubbles.
export function authorColor(name: string, skin: Skin) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return skin.authorColors[h % skin.authorColors.length];
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'вчера';
  if (now.getTime() - d.getTime() < 6 * 864e5) return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()];
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

export function clockTime(ts: number) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Date pill in the feed: «СЕГОДНЯ, 8 ОКТЯБРЯ».
export function dayLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  let label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (d.getFullYear() !== now.getFullYear()) label += ` ${d.getFullYear()}`;
  if (d.toDateString() === now.toDateString()) label = `сегодня, ${label}`;
  else if (d.toDateString() === yesterday.toDateString()) label = `вчера, ${label}`;
  return label.toUpperCase();
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
