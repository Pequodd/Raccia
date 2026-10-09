// Design tokens from docs/design/y2k/README.md («Design Tokens»).

export const colors = {
  ink: '#1B1530',
  text2: '#4A4560',
  text3: '#5A5570',
  text4: '#6A6580',
  placeholder: '#7A7690',
  bondiText: '#00708A',
  focus: '#00AACD',
  grapeText: '#5A2FA8',
  serviceText: '#3E1F80',
  neon: '#9BFF3A',
  neonGlow: '#7CE01A',
  pink: '#D400AE',
  chromeEdge: '#8C96A0',
  chromeEdgeDark: '#6E7882',
  lcdBg: '#B5C79A',
  lcdText: '#1E2A10',
  led: '#FF3030',
  mineText: '#2A1200',
  mineMeta: '#6A3400',
  white: '#FFFFFF',
};

type Gradient = readonly [string, string];

export const plastic = {
  bondi: ['#00BEE1', '#00708A'],
  tangerine: ['#FFB050', '#FF7A00'],
  grape: ['#A57BE8', '#5A2FA8'],
  lime: ['#C2F06A', '#7CC21E'],
  pink: ['#FF6AE6', '#D400AE'],
  danger: ['#FF6A8A', '#D4002E'],
  bubbleTheirs: ['#0096B8', '#006A84'],
  bubbleMine: ['#FFCB8A', '#FF9A2E'],
  vote: ['rgba(150,105,225,0.92)', 'rgba(80,40,160,0.95)'],
} satisfies Record<string, Gradient>;

export const chromeStops = {
  colors: ['#FFFFFF', '#E3E7EC', '#B9C1C9', '#D5DBE1', '#F2F4F6'] as const,
  locations: [0, 0.4, 0.52, 0.75, 1] as const,
};

// CSS 160deg ≈ top-left → bottom-right, mostly downward.
export const diagonal = { start: { x: 0.33, y: 0 }, end: { x: 0.67, y: 1 } };

export const fonts = {
  display: 'Exo2_800ExtraBold_Italic',
  body: 'Nunito_400Regular',
  bodyBold: 'Nunito_700Bold',
  bodyHeavy: 'Nunito_800ExtraBold',
  mono: 'PTMono_400Regular',
};

const AVATARS: Gradient[] = [
  plastic.bondi,
  plastic.tangerine,
  plastic.grape,
  plastic.lime,
  plastic.pink,
  ['#5B6CFF', '#2A2F9E'],
  ['#4D4470', '#1B1530'],
];

export function avatarGradient(seed: string): Gradient {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

// Initials: first letters of the first two words («Семейная тусовка» → «СТ»).
export function initials(name: string) {
  const words = name.replace(/[«»"]/g, '').split(/[\s_]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 1);
  return letters.toUpperCase();
}

// Light text on dark lollipops, dark on lime.
export function avatarTextColor(gradient: Gradient) {
  return gradient === plastic.lime ? '#1F3300' : colors.white;
}

// Pale author colours for names inside bondi bubbles.
const AUTHOR_COLORS = ['#FFE08A', '#FFC6F2', '#C8FF8A', '#B8F0FF', '#FFD0A8'];

export function authorColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AUTHOR_COLORS[h % AUTHOR_COLORS.length];
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

// The headline feature. Oleg runs on a Sber server, which is the joke.
export const promise = 'БЕЗ ЦЕНЗУРЫ\nИ БЛОКИРОВОК РКН!';
export const promiseProof = '✓ Сервер любезно предоставлен Сбером';
