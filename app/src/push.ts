import { Platform } from 'react-native';
import { api } from './api';

// Web Push for the browser version and the installed PWA (iPhone: iOS 16.4+, only once
// Oleg is on the home screen). The native apps will get their own push later.

const web = Platform.OS === 'web' && typeof window !== 'undefined';

export function isIOS() {
  if (!web) return Platform.OS === 'ios';
  const ua = navigator.userAgent;
  // iPadOS pretends to be a Mac; touch gives it away.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Opened from the home-screen icon rather than in a browser tab.
export function isStandalone() {
  if (!web) return true;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

export type PushState =
  | 'on'
  | 'off'
  | 'denied' // blocked in browser/phone settings
  | 'install' // iPhone in Safari: add to home screen first
  | 'unsupported';

export async function pushState(): Promise<PushState> {
  if (!web) return 'unsupported';
  if (isIOS() && !isStandalone()) return 'install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export function registerServiceWorker() {
  if (!web || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Must run from a tap: browsers only ask for permission in answer to a gesture.
export async function enablePush(): Promise<PushState> {
  const state = await pushState();
  if (state !== 'off' && state !== 'on') return state;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  await navigator.serviceWorker.register('/sw.js');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const { publicKey } = await api.pushKey();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  }
  await api.pushSubscribe(sub.toJSON());
  return 'on';
}

export async function disablePush(): Promise<void> {
  if (!web || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}

// After a login on a browser that already allowed push: tie its subscription to this account.
export async function resubscribe() {
  if ((await pushState().catch(() => 'unsupported')) !== 'on') return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await api.pushSubscribe(sub.toJSON()).catch(() => {});
}

// Unread count on the home-screen icon (installed PWA) and in the tab title.
export function setUnreadBadge(count: number) {
  if (!web) return;
  document.title = count > 0 ? `(${count}) Олег` : 'Олег';
  const nav = navigator as { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  if (count > 0) nav.setAppBadge?.(count).catch(() => {});
  else nav.clearAppBadge?.().catch(() => {});
}

// A notification tap while the app is open: the service worker asks us to open a chat.
export function onOpenFromNotification(handler: (chatId: number | null) => void) {
  if (!web || !('serviceWorker' in navigator)) return () => {};
  const listener = (e: MessageEvent) => {
    if (e.data?.type !== 'open') return;
    const chat = new URLSearchParams(String(e.data.url).split('?')[1] ?? '').get('chat');
    handler(chat ? Number(chat) : null);
  };
  navigator.serviceWorker.addEventListener('message', listener);
  return () => navigator.serviceWorker.removeEventListener('message', listener);
}

// ?chat=12 in the address: the app was opened from a notification.
export function chatFromUrl(): number | null {
  if (!web) return null;
  const id = Number(new URLSearchParams(window.location.search).get('chat'));
  if (!id) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return id;
}

// A short two-note chirp for in-app notifications (web only, no sound files to ship).
let audio: AudioContext | null = null;
export function chirp() {
  if (!web) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.06, t + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.08);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.09);
    }
  } catch {
    // no audio: fine
  }
}
