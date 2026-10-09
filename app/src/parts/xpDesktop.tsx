import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GridBackground } from '../components/y2k';
import { clockTime } from '../y2k';

// The XP skin's window buttons: «свернуть» drops Oleg to a desktop with a taskbar,
// «развернуть» goes fullscreen, ✕ on the main window asks «Завершение работы».

const logo = require('../../assets/logo.webp');
const F = { body: 'PTSans_400Regular', bold: 'PTSans_700Bold' };

type XpState = { minimized: boolean; shutdown: boolean };
let state: XpState = { minimized: false, shutdown: false };
const listeners = new Set<(s: XpState) => void>();
function set(patch: Partial<XpState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

export const xpWindow = {
  minimize: () => set({ minimized: true }),
  restore: () => set({ minimized: false }),
  askShutdown: () => set({ shutdown: true }),
};

function useXp() {
  const [s, setS] = useState(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

const web = Platform.OS === 'web' && typeof document !== 'undefined';
export const canMaximize = web && Boolean(document.fullscreenEnabled);

export function useMaximized() {
  const [on, setOn] = useState(web && Boolean(document.fullscreenElement));
  useEffect(() => {
    if (!web) return;
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  return on;
}

export function toggleMaximized() {
  if (!canMaximize) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  return <Text style={s.clock}>{clockTime(now)}</Text>;
}

// Shown by the shell while the XP skin is on.
export function XpDesktop({ onLogout }: { onLogout: () => void }) {
  const xp = useXp();
  const insets = useSafeAreaInsets();
  return (
    <>
      {xp.minimized ? (
        <View style={s.desktop}>
          <GridBackground />
          <Pressable onPress={xpWindow.restore} style={[s.icon, { top: insets.top + 24 }]} accessibilityRole="button" accessibilityLabel="Открыть Олега">
            <Image source={logo} style={s.iconImage} contentFit="contain" />
            <Text style={s.iconText}>Олег XP</Text>
          </Pressable>
          <View style={[s.taskbar, { paddingBottom: insets.bottom }]}>
            <LinearGradient colors={['#3F8CF3', '#245EDC', '#1F55CF', '#1941A5']} style={StyleSheet.absoluteFill} />
            <View style={s.taskRow}>
              <Pressable onPress={xpWindow.askShutdown} style={s.start} accessibilityRole="button" accessibilityLabel="Пуск">
                <LinearGradient colors={['#5ECB5E', '#3AA53A', '#2D8F2D']} style={[StyleSheet.absoluteFill, s.startShape]} />
                <Text style={s.startText}>пуск</Text>
              </Pressable>
              <Pressable onPress={xpWindow.restore} style={s.task} accessibilityRole="button" accessibilityLabel="Развернуть Олега">
                <Image source={logo} style={{ width: 16, height: 16 }} contentFit="contain" />
                <Text style={s.taskText} numberOfLines={1}>
                  Сообщения — Олег XP
                </Text>
              </Pressable>
              <View style={s.tray}>
                <Clock />
              </View>
            </View>
          </View>
        </View>
      ) : null}

      <Modal visible={xp.shutdown} transparent animationType="fade" onRequestClose={() => set({ shutdown: false })}>
        <View style={s.scrim}>
          <View style={s.dialog}>
            <LinearGradient colors={['#0A246A', '#3A6EA5']} style={s.dialogHead}>
              <Text style={s.dialogTitle}>Завершение работы Олег XP</Text>
            </LinearGradient>
            <View style={s.dialogBody}>
              {[
                { label: 'Свернуть', hint: 'Ждущий режим', color: '#E8B323', act: () => set({ shutdown: false, minimized: true }) },
                { label: 'Выход', hint: 'Выйти из Олега', color: '#D2401E', act: () => (set({ shutdown: false, minimized: false }), onLogout()) },
                { label: 'Отмена', hint: 'Вернуться', color: '#3FA33F', act: () => set({ shutdown: false }) },
              ].map((b) => (
                <Pressable key={b.label} onPress={b.act} style={s.choice} accessibilityRole="button" accessibilityLabel={b.label}>
                  <View style={[s.choiceIcon, { backgroundColor: b.color }]}>
                    <Text style={s.choiceGlyph}>{b.label === 'Выход' ? '⏻' : b.label === 'Свернуть' ? '☾' : '↩'}</Text>
                  </View>
                  <Text style={s.choiceText}>{b.label}</Text>
                  <Text style={s.choiceHint}>{b.hint}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  desktop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 90 },
  icon: { position: 'absolute', left: 18, width: 84, alignItems: 'center', gap: 4 },
  iconImage: { width: 56, height: 56, borderRadius: 10 },
  iconText: { fontFamily: F.body, fontSize: 13, color: '#FFFFFF', textAlign: 'center', textShadowColor: '#000', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 2 },
  taskbar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: '#5A9BFF' },
  taskRow: { height: 44, flexDirection: 'row', alignItems: 'center' },
  start: { height: 44, justifyContent: 'center', paddingLeft: 14, paddingRight: 22 },
  startShape: { borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  startText: { fontFamily: F.bold, fontStyle: 'italic', fontSize: 20, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 1 },
  task: {
    flex: 1,
    maxWidth: 220,
    height: 32,
    marginHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 3,
    backgroundColor: '#3C81F3',
    borderWidth: 1,
    borderColor: '#2A5FD0',
  },
  taskText: { flex: 1, fontFamily: F.body, fontSize: 12, color: '#FFFFFF' },
  tray: { marginLeft: 'auto', height: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#0F8DEB', borderLeftWidth: 1, borderLeftColor: '#0A5AA8' },
  clock: { fontFamily: F.body, fontSize: 13, color: '#FFFFFF' },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 380, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#0A246A', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  dialogHead: { paddingVertical: 14, paddingHorizontal: 16 },
  dialogTitle: { fontFamily: F.bold, fontSize: 17, color: '#FFFFFF' },
  dialogBody: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 22, paddingHorizontal: 10, backgroundColor: '#3A6EA5' },
  choice: { alignItems: 'center', gap: 6, width: 100 },
  choiceIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  choiceGlyph: { fontSize: 22, color: '#FFFFFF' },
  choiceText: { fontFamily: F.bold, fontSize: 14, color: '#FFFFFF' },
  choiceHint: { fontFamily: F.body, fontSize: 11, color: '#DCE6F5', textAlign: 'center' },
});
