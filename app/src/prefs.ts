import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

// Per-device notification preferences (push itself lives in the browser's subscription).
export type Prefs = {
  banners: boolean; // banner on top when a message arrives in another chat
  sound: boolean; // chirp with the banner
  installHintAt: number; // when the «install as app» sheet was last dismissed
};

const KEY = 'oleg.prefs';
let prefs: Prefs = { banners: true, sound: true, installHintAt: 0 };
let loaded = false;
const listeners = new Set<(p: Prefs) => void>();

const ready = AsyncStorage.getItem(KEY)
  .then((raw) => {
    if (raw) prefs = { ...prefs, ...JSON.parse(raw) };
  })
  .catch(() => {})
  .finally(() => {
    loaded = true;
    for (const l of listeners) l(prefs);
  });

export function getPrefs() {
  return prefs;
}

export function setPrefs(patch: Partial<Prefs>) {
  prefs = { ...prefs, ...patch };
  AsyncStorage.setItem(KEY, JSON.stringify(prefs)).catch(() => {});
  for (const l of listeners) l(prefs);
}

// [prefs, loaded]: loaded is false until storage has been read.
export function usePrefs(): [Prefs, boolean] {
  const [state, setState] = useState(prefs);
  const [isLoaded, setLoaded] = useState(loaded);
  useEffect(() => {
    const l = (p: Prefs) => {
      setState(p);
      setLoaded(true);
    };
    listeners.add(l);
    ready.then(() => l(prefs));
    return () => {
      listeners.delete(l);
    };
  }, []);
  return [state, isLoaded];
}
