import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { night } from './night';
import { winamp } from './winamp';
import type { Skin } from './types';
import { xp } from './xp';
import { y2k } from './y2k';

export type { Copy, Fill, Frame, Gradient, Skin } from './types';

// Add a skin here and it appears in Settings.
export const skins: Skin[] = [y2k, night, winamp, xp];
export const defaultSkin = xp; // who never picked a skin gets Олег XP

const STORAGE_KEY = 'oleg.skin';

type SkinState = { skin: Skin; setSkin: (id: string) => void };

const SkinContext = createContext<SkinState>({ skin: defaultSkin, setSkin: () => {} });

export function SkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>(defaultSkin);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((id) => {
        const saved = skins.find((s) => s.id === id);
        if (saved) setSkinState(saved);
      })
      .catch(() => {});
  }, []);

  const setSkin = useCallback((id: string) => {
    const next = skins.find((s) => s.id === id);
    if (!next) return;
    setSkinState(next);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  }, []);

  return <SkinContext.Provider value={{ skin, setSkin }}>{children}</SkinContext.Provider>;
}

export function useSkin(): Skin {
  return useContext(SkinContext).skin;
}

export function useSkinSwitcher() {
  return useContext(SkinContext);
}

// Styles that depend on the skin: built once per skin and cached.
//   const useStyles = makeStyles(({ colors, fonts }) => ({ title: { color: colors.ink } }));
//   const styles = useStyles();
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (skin: Skin) => T) {
  const cache = new WeakMap<Skin, T>();
  return function useStyles(): T {
    const skin = useSkin();
    let styles = cache.get(skin);
    if (!styles) {
      styles = StyleSheet.create(clampRadii(factory(skin), skin.shape.maxRadius));
      cache.set(skin, styles);
    }
    return styles;
  };
}

// Square themes (Winamp, DOS, Dendy) clamp every corner radius in one place.
const RADIUS_KEYS = /^border(TopLeft|TopRight|BottomLeft|BottomRight)?Radius$/;
function clampRadii<T>(styles: T, max: number): T {
  if (max >= 999) return styles;
  const out: Record<string, unknown> = {};
  for (const [name, style] of Object.entries(styles as Record<string, Record<string, unknown>>)) {
    const copy: Record<string, unknown> = { ...style };
    for (const key of Object.keys(copy)) {
      if (RADIUS_KEYS.test(key) && typeof copy[key] === 'number') copy[key] = Math.min(copy[key] as number, max);
    }
    out[name] = copy;
  }
  return out as T;
}

// The same clamp for radii computed in components.
export function radius(skin: Skin, value: number) {
  return Math.min(value, skin.shape.maxRadius);
}
