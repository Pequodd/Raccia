import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { Lollipop } from '../components/y2k';
import { clockTime } from '../y2k';
import type { ChatHeaderProps, ListHeaderProps, Parts, TabItem } from './index';

// Windows XP (Luna) skin: windows with blue title bars, a taskbar with «пуск».
const F = { body: 'PTSans_400Regular', bold: 'PTSans_700Bold' };
const TITLE = ['#3D95FF', '#0A64E8', '#0553D4', '#0A5BE0', '#1F6FF0'] as const;
const TITLE_AT = [0, 0.1, 0.5, 0.9, 1] as const;
const TASKBAR = ['#3F8CF3', '#245EDC', '#1F55CF', '#1941A5'] as const;

// Minimise / maximise / close squares at the right of a title bar.
function Caption({ onClose }: { onClose?: () => void }) {
  return (
    <View style={s.caption}>
      <View style={s.capBtn}>
        <View style={{ width: 8, height: 2, backgroundColor: '#fff', marginTop: 8 }} />
      </View>
      <View style={s.capBtn}>
        <View style={{ width: 10, height: 9, borderWidth: 1, borderTopWidth: 3, borderColor: '#fff' }} />
      </View>
      <Pressable
        onPress={onClose}
        disabled={!onClose}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        style={({ pressed }) => [s.capBtn, s.close, pressed && { opacity: 0.8 }]}
      >
        <LinearGradient colors={['#F0957A', '#D2401E']} style={[StyleSheet.absoluteFill, { borderRadius: 3 }]} />
        <Text style={s.closeX}>✕</Text>
      </Pressable>
    </View>
  );
}

function TitleBar({ title, icon, onClose, topInset }: { title: string; icon?: string; onClose?: () => void; topInset: number }) {
  return (
    <View style={[s.titleBar, { paddingTop: topInset }]}>
      <LinearGradient colors={TITLE} locations={TITLE_AT} style={StyleSheet.absoluteFill} />
      <View style={s.titleRow}>
        <Text style={s.titleIcon}>{icon ?? '✉'}</Text>
        <Text numberOfLines={1} style={s.titleText}>
          {title}
        </Text>
        <Caption onClose={onClose} />
      </View>
    </View>
  );
}

function ListHeader({ myName, myAvatar, connected, query, onQuery, onNewChat, topInset }: ListHeaderProps) {
  return (
    <View style={s.header}>
      <TitleBar title="Сообщения — Олег XP" topInset={topInset} />
      <View style={s.menu}>
        {['Файл', 'Правка', 'Вид', 'Избранное', 'Справка'].map((m) => (
          <Text key={m} style={s.menuItem}>
            {m}
          </Text>
        ))}
      </View>
      <View style={s.toolbar}>
        <Lollipop name={myName} avatar={myAvatar} size={34} online={connected} />
        <Pressable onPress={onNewChat} accessibilityRole="button" accessibilityLabel="Новый канал" style={({ pressed }) => [s.toolButton, pressed && s.toolPressed]}>
          <Text style={s.toolGlyph}>✚</Text>
          <Text style={s.toolText}>Новое окно</Text>
        </Pressable>
        <View style={s.searchBox}>
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20" stroke="#2D8F2D" strokeWidth={2.6} fill="none" />
          </Svg>
          <TextInput
            style={s.search}
            value={query}
            onChangeText={onQuery}
            placeholder="Найти…"
            placeholderTextColor="#8A8A8A"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>
    </View>
  );
}

function ChatHeader({ title, subtitle, avatar, online, onBack, wide, topInset }: ChatHeaderProps) {
  return (
    <View style={s.header}>
      <TitleBar title={`${title} — Беседа`} icon="💬" onClose={onBack} topInset={wide ? 0 : topInset} />
      <View style={s.toolbar}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Назад" style={({ pressed }) => [s.toolButton, pressed && s.toolPressed]}>
            <View style={s.backBall}>
              <LinearGradient colors={['#6FD36F', '#2D8F2D']} style={[StyleSheet.absoluteFill, { borderRadius: 11 }]} />
              <Text style={s.backArrow}>←</Text>
            </View>
            <Text style={s.toolText}>Назад</Text>
          </Pressable>
        ) : null}
        <Lollipop name={title} avatar={avatar} size={34} online={online} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={s.chatName}>
            {title}
          </Text>
          <Text numberOfLines={1} style={s.chatSub}>
            {subtitle}
          </Text>
        </View>
      </View>
    </View>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  return <Text style={s.clock}>{clockTime(now.getTime())}</Text>;
}

function WindowsFlag({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Rect x="1" y="1" width="8" height="8" rx="1.5" fill="#F25022" />
      <Rect x="11" y="1" width="8" height="8" rx="1.5" fill="#7FBA00" />
      <Rect x="1" y="11" width="8" height="8" rx="1.5" fill="#00A4EF" />
      <Rect x="11" y="11" width="8" height="8" rx="1.5" fill="#FFB900" />
    </Svg>
  );
}

// The taskbar: «пуск» opens the chats, the tabs are «windows», a clock in the tray.
function TabBar({ items, bottomInset }: { items: TabItem[]; bottomInset: number }) {
  const first = items[0];
  return (
    <View style={[s.taskbar, { paddingBottom: bottomInset }]}>
      <LinearGradient colors={TASKBAR} style={StyleSheet.absoluteFill} />
      <View style={s.taskRow}>
        <Pressable onPress={first?.onPress} accessibilityRole="button" accessibilityLabel="Пуск" style={({ pressed }) => [s.start, pressed && { opacity: 0.85 }]}>
          <LinearGradient colors={['#5ECB5E', '#3AA53A', '#2D8F2D']} style={[StyleSheet.absoluteFill, s.startShape]} />
          <WindowsFlag size={16} />
          <Text style={s.startText}>пуск</Text>
        </Pressable>
        <View style={s.tasks}>
          {items.map((it) => (
            <Pressable key={it.key} onPress={it.onPress} accessibilityRole="tab" accessibilityLabel={it.label} style={[s.task, it.on ? s.taskOn : s.taskOff]}>
              <Text numberOfLines={1} style={s.taskText}>
                {it.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={s.tray}>
          <View style={s.trayDot} />
          <Clock />
        </View>
      </View>
    </View>
  );
}

function DayPill({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={s.day}>{label}</Text>
    </View>
  );
}

// Service messages are the yellow tray balloons.
function Service({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={s.balloon}>
        <Text style={s.balloonTitle}>ⓘ Олег XP</Text>
        <Text style={s.balloonText}>{text}</Text>
      </View>
    </View>
  );
}

export const xpParts: Partial<Parts> = { ListHeader, ChatHeader, TabBar, DayPill, Service };

const s = StyleSheet.create({
  header: { zIndex: 2, backgroundColor: '#ECE9D8', borderBottomWidth: 1, borderBottomColor: '#ACA899' },
  titleBar: { borderTopLeftRadius: 0, overflow: 'hidden' },
  titleRow: { height: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 4 },
  titleIcon: { fontSize: 15, color: '#fff' },
  titleText: {
    flex: 1,
    fontFamily: F.bold,
    fontSize: 15,
    color: '#FFFFFF',
    textShadowColor: '#0A246A',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  caption: { flexDirection: 'row', gap: 3 },
  capBtn: {
    width: 24,
    height: 24,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    backgroundColor: '#2A6CF0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  close: { backgroundColor: '#D2401E' },
  closeX: { fontFamily: F.bold, fontSize: 13, color: '#FFFFFF' },
  menu: { flexDirection: 'row', gap: 14, paddingHorizontal: 10, paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#D8D2BD' },
  menuItem: { fontFamily: F.body, fontSize: 13, color: '#000' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6 },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 6, height: 34, borderRadius: 3, borderWidth: 1, borderColor: 'transparent' },
  toolPressed: { borderColor: '#ACA899', backgroundColor: '#E3E0D3' },
  toolGlyph: { fontFamily: F.bold, fontSize: 16, color: '#2D8F2D' },
  toolText: { fontFamily: F.body, fontSize: 13, color: '#000' },
  searchBox: {
    flex: 1,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#7F9DB9',
  },
  search: { flex: 1, minWidth: 0, fontFamily: F.body, fontSize: 14, color: '#000', outlineWidth: 0 },
  backBall: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backArrow: { fontFamily: F.bold, fontSize: 14, color: '#fff', marginTop: -2 },
  chatName: { fontFamily: F.bold, fontSize: 15, color: '#0B2E8A' },
  chatSub: { fontFamily: F.body, fontSize: 12, color: '#3B3B3B' },
  taskbar: { borderTopWidth: 1, borderTopColor: '#5A9BFF' },
  taskRow: { height: 44, flexDirection: 'row', alignItems: 'center' },
  start: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 20 },
  startShape: { borderTopRightRadius: 14, borderBottomRightRadius: 14 },
  startText: {
    fontFamily: F.bold,
    fontStyle: 'italic',
    fontSize: 20,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 1,
  },
  tasks: { flex: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 6 },
  task: { flex: 1, height: 32, borderRadius: 3, justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1 },
  taskOn: { backgroundColor: '#1E4FC2', borderColor: '#0F2F85', boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.4)' },
  taskOff: { backgroundColor: '#3C81F3', borderColor: '#2A5FD0' },
  taskText: { fontFamily: F.body, fontSize: 12, color: '#FFFFFF' },
  tray: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    backgroundColor: '#0F8DEB',
    borderLeftWidth: 1,
    borderLeftColor: '#0A5AA8',
  },
  trayDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5EE05E' },
  clock: { fontFamily: F.body, fontSize: 13, color: '#FFFFFF' },
  day: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: '#7F9DB9',
    borderRadius: 3,
    fontFamily: F.body,
    fontSize: 12,
    color: '#0B2E8A',
  },
  balloon: {
    maxWidth: 320,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFE1',
    borderWidth: 1,
    borderColor: '#000000',
    borderRadius: 8,
    gap: 2,
    boxShadow: '2px 2px 4px rgba(0,0,0,0.3)',
  },
  balloonTitle: { fontFamily: F.bold, fontSize: 13, color: '#000' },
  balloonText: { fontFamily: F.body, fontSize: 13, color: '#000' },
});
