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
  return 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();
export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';
