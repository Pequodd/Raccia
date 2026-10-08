import { useColorScheme } from 'react-native';

const light = {
  bg: '#ffffff',
  surface: '#f3f4f7',
  border: '#e3e5ea',
  text: '#14161a',
  muted: '#6b7280',
  accent: '#5b5bd6',
  accentText: '#ffffff',
  bubbleMine: '#5b5bd6',
  bubbleMineText: '#ffffff',
  bubbleTheirs: '#eef0f4',
  bubbleTheirsText: '#14161a',
  online: '#22a06b',
  danger: '#d93f3f',
};

const dark: typeof light = {
  bg: '#0f1115',
  surface: '#181b21',
  border: '#262a33',
  text: '#eceef2',
  muted: '#8b93a1',
  accent: '#7c7cf0',
  accentText: '#ffffff',
  bubbleMine: '#5b5bd6',
  bubbleMineText: '#ffffff',
  bubbleTheirs: '#21252d',
  bubbleTheirsText: '#eceef2',
  online: '#3cc58a',
  danger: '#ef6262',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

const AVATAR_COLORS = ['#e5484d', '#f76b15', '#ffb224', '#30a46c', '#12a594', '#0090ff', '#5b5bd6', '#d6409f'];

export function avatarColor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function formatTime(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return hhmm;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() === now.getFullYear() ? `${dd}.${mm}` : `${dd}.${mm}.${d.getFullYear()}`;
}
