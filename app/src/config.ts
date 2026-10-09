import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Server address. Override with EXPO_PUBLIC_API_URL (e.g. https://api.example.com).
// In development, fall back to the machine running Metro so phones on the same
// network and emulators reach the local server without extra setup.
function resolveApiUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri && Platform.OS !== 'web') {
    return `http://${hostUri.split(':')[0]}:3000`;
  }
  if (Platform.OS === 'android') return 'http://10.0.2.2:3000';
  // Web: the server runs on the same machine as the page, whatever address it was opened by.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:3000`;
  }
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

// Where invite links point: the web build of the app.
function resolveWebUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_WEB_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') return window.location.origin;
  return API_URL;
}

export const WEB_URL = resolveWebUrl();

export const inviteLink = (code: string) => `${WEB_URL}/?invite=${encodeURIComponent(code)}`;

// Accepts a bare code or a pasted link with ?invite=…
export function parseInvite(input: string): string {
  const trimmed = input.trim();
  const fromLink = trimmed.match(/[?&]invite=([\w-]+)/);
  return fromLink ? fromLink[1] : trimmed;
}
