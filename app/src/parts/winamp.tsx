import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { TitleStrip } from '../components/heroes';
import { avatarSource, stickers } from '../components/y2k';
import { ToolGlyph, type ToolIcon } from '../media/ComposerTools';
import type { ChatHeaderProps, ChatRowProps, ComposerProps, ListHeaderProps, Parts, TabItem } from './index';

// Winamp skin, laid out from docs/design/retro/oleg-winamp.dc.html (W07, W09).
const F = {
  display: 'RussoOne_400Regular',
  body: 'PTSans_400Regular',
  bold: 'PTSans_700Bold',
  mono: 'PTMono_400Regular',
};
const C = {
  text: '#E6E9F2',
  dim: '#9AA0B4',
  dim2: '#8A90A6',
  lcd: '#050805',
  green: '#3CFF5A',
  greenDim: '#2E8B3A',
  amber: '#F2A51A',
  yellow: '#F2D21A',
  red: '#FF3B3B',
};
const bevel = (light: string, dark: string, width = 1): ViewStyle => ({
  borderWidth: width,
  borderTopColor: light,
  borderLeftColor: light,
  borderRightColor: dark,
  borderBottomColor: dark,
});
const sunken = bevel('#121318', '#5A6078');
const metalButton = bevel('#7A809A', '#121318');
const amberButton = bevel('#FFE29A', '#7A4A00');

// Square tile with a letter (or a sticker), as in the playlist.
function Tile({ name, avatar, size, color, online, gold }: { name: string; avatar: string | null; size: number; color?: string; online?: boolean; gold?: boolean }) {
  const source = avatarSource(avatar);
  const image = source?.image;
  return (
    <View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
        gold
          ? { backgroundColor: '#D9B44A', ...bevel('#FFF0B8', '#6A5410', 2) }
          : { backgroundColor: image ? C.lcd : color, ...bevel('rgba(255,255,255,0.55)', 'rgba(0,0,0,0.45)', 2) },
      ]}
    >
      {image ? (
        <View style={{ position: 'absolute', inset: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'flex-end' }}>
          {source?.photo ? (
            <Image source={image} style={{ width: size, height: size }} contentFit="cover" />
          ) : (
            <Image source={image} style={{ width: size + 6, height: size + 6, marginBottom: -4 }} contentFit="contain" />
          )}
        </View>
      ) : (
        <Text style={{ fontFamily: F.display, fontSize: size * 0.42, color: gold ? '#2A2000' : '#14151B' }}>
          {name.replace(/[«»"]/g, '').slice(0, 1).toUpperCase()}
        </Text>
      )}
      {online ? <View style={s.online} /> : null}
    </View>
  );
}

const TILE_COLORS = ['#D9B44A', '#4AA8FF', '#A57BE8', '#FF6AA8', '#5CE06A', '#FF9A3C'];
function tileColor(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

function ListHeader({ myName, myAvatar, query, onQuery, onNewChat, topInset }: ListHeaderProps) {
  return (
    <View style={[s.header, { paddingTop: topInset }]}>
      <LinearGradient colors={['#454A5C', '#2C2F3B']} style={StyleSheet.absoluteFill} />
      <TitleStrip title="ПЛЕЙЛИСТ" />
      <View style={s.listHeaderRow}>
        <Tile name={myName} avatar={myAvatar} size={38} gold />
        <Text style={s.listTitle}>Сообщения</Text>
        <Pressable onPress={onNewChat} accessibilityRole="button" accessibilityLabel="Новый канал" style={({ pressed }) => [s.plus, pressed && s.pressedAmber]}>
          <LinearGradient colors={['#FFC84A', '#E08A00']} style={StyleSheet.absoluteFill} />
          <Text style={s.plusText}>+</Text>
        </Pressable>
      </View>
      <View style={s.searchWrap}>
        <TextInput
          style={s.search}
          value={query}
          onChangeText={onQuery}
          placeholder="ПОИСК ПО ПЛЕЙЛИСТУ…"
          placeholderTextColor={C.greenDim}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
    </View>
  );
}

function ChatRow({ index, title, preview, typing, time, unread, isNew, online, avatar, selected, onPress }: ChatRowProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, selected && s.rowSelected, pressed && { backgroundColor: '#2A2D38' }]}>
      <Text style={s.rowNum}>{index + 1}.</Text>
      <Tile name={title} avatar={avatar} size={42} color={tileColor(title)} online={online} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={s.rowLine}>
          <Text numberOfLines={1} style={s.rowName}>
            {title}
          </Text>
          {time ? <Text style={s.rowTime}>{time}</Text> : null}
        </View>
        <View style={s.rowLine}>
          <Text numberOfLines={1} style={[s.rowPreview, typing && { color: C.yellow }]}>
            {preview}
          </Text>
          {unread > 0 ? (
            <Text style={s.unread}>{unread}</Text>
          ) : isNew ? (
            <Text style={s.isNew}>НОВЫЙ</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ChatHeader({ title, subtitle, avatar, online, onBack, onOpenProfile, wide, topInset }: ChatHeaderProps) {
  return (
    <View style={[s.header, { paddingTop: wide ? 0 : topInset }]}>
      <LinearGradient colors={['#454A5C', '#2C2F3B']} style={StyleSheet.absoluteFill} />
      <View style={s.chatHeaderRow}>
        {onBack ? (
          <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Назад" style={({ pressed }) => [s.square, pressed && s.pressedMetal]}>
            <LinearGradient colors={['#4E5366', '#2E313D']} style={StyleSheet.absoluteFill} />
            <Text style={s.squareGlyph}>‹</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onOpenProfile} disabled={!onOpenProfile} style={s.titleLcd} accessibilityLabel={onOpenProfile ? `Профиль: ${title}` : undefined}>
          <Text numberOfLines={1} style={s.titleLcdName}>
            {title}
          </Text>
          <Text numberOfLines={1} style={s.titleLcdSub}>
            {subtitle}
          </Text>
        </Pressable>
        <Pressable onPress={onOpenProfile} disabled={!onOpenProfile}>
          <Tile name={title} avatar={avatar} size={38} gold online={online} />
        </Pressable>
      </View>
    </View>
  );
}

function MetalTool({ icon, label, onPress }: { icon: ToolIcon; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [s.tool, pressed && s.pressedMetal]}>
      <LinearGradient colors={['#4E5366', '#2E313D']} style={StyleSheet.absoluteFill} />
      <ToolGlyph name={icon} color={C.green} size={20} />
    </Pressable>
  );
}

function Composer({ value, onChange, onSend, onKeyPress, onAttach, onMic, onCircle, wide, bottomInset }: ComposerProps) {
  const can = value.trim().length > 0;
  return (
    <View style={[s.composer, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <LinearGradient colors={['#454A5C', '#2C2F3B']} style={StyleSheet.absoluteFill} />
      <View style={[s.composerRow, wide && { maxWidth: 720, width: '100%', alignSelf: 'center' }]}>
        <MetalTool icon="attach" label="Прикрепить фото или видео" onPress={onAttach} />
        <View style={s.field}>
          <TextInput
            style={s.fieldInput}
            value={value}
            onChangeText={onChange}
            onKeyPress={onKeyPress}
            placeholder="Сигнал в эфир…"
            placeholderTextColor={C.greenDim}
            multiline
            numberOfLines={Platform.OS === 'web' ? 1 : undefined}
            maxLength={4000}
          />
          <Image source={stickers.idea} style={{ width: 30, height: 30 }} contentFit="contain" />
        </View>
        {can ? null : (
          <>
            <MetalTool icon="mic" label="Записать голосовое" onPress={onMic} />
            <MetalTool icon="circle" label="Записать кружок" onPress={onCircle} />
          </>
        )}
        {can ? <Pressable
          onPress={onSend}
          disabled={!can}
          accessibilityRole="button"
          accessibilityLabel="Передать"
          style={({ pressed }) => [s.send, { opacity: can ? 1 : 0.55 }, pressed && s.pressedAmber]}
        >
          <LinearGradient colors={['#FFC84A', '#E08A00']} style={StyleSheet.absoluteFill} />
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M6 4l14 8-14 8z" fill="#2A1600" />
          </Svg>
        </Pressable> : null}
      </View>
    </View>
  );
}

const TAB_GLYPH: Record<string, string> = { chats: '≡', profile: '☺', settings: '⚙' };

function TabBar({ items, bottomInset }: { items: TabItem[]; bottomInset: number }) {
  return (
    <View style={[s.tabBar, { paddingBottom: Math.max(bottomInset, 8) + 18 }]}>
      <LinearGradient colors={['#454A5C', '#2C2F3B']} style={StyleSheet.absoluteFill} />
      {items.map((it) => (
        <Pressable key={it.key} onPress={it.onPress} accessibilityRole="tab" accessibilityLabel={it.label} style={[s.tab, it.on && s.tabOn]}>
          <Text style={[s.tabGlyph, it.on && { color: C.green }]}>{TAB_GLYPH[it.key] ?? '·'}</Text>
          <Text style={[s.tabLabel, it.on && { color: C.green }]}>{it.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function DayPill({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={s.day}>{label.replace(', ', ' · ')}</Text>
    </View>
  );
}

function Service({ text }: { text: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={s.service}>{text}</Text>
    </View>
  );
}

// «Набирает» — a little spectrum analyser instead of dots.
function Typing({ name, group }: { name: string; group: boolean }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setT((v) => v + 1), 180);
    return () => clearInterval(timer);
  }, []);
  const colors = [C.green, C.yellow, C.green, C.red, C.green];
  return (
    <View style={{ alignItems: 'flex-start', gap: 2 }}>
      {group ? <Text style={s.typingName}>{name}</Text> : null}
      <View style={s.typing}>
        {colors.map((c, i) => (
          <View key={i} style={{ width: 4, height: 6 + ((t * 7 + i * 5) % 13), backgroundColor: c }} />
        ))}
      </View>
    </View>
  );
}

export const winampParts: Partial<Parts> = { ListHeader, ChatRow, ChatHeader, Composer, TabBar, DayPill, Service, Typing };

const s = StyleSheet.create({
  header: { borderBottomWidth: 1, borderBottomColor: '#0B0C10', zIndex: 2 },
  online: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 10,
    height: 10,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: '#22252F',
    boxShadow: `0 0 6px ${C.green}`,
  },
  listHeaderRow: { height: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  listTitle: { flex: 1, fontFamily: F.display, fontSize: 24, color: C.text },
  plus: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...amberButton },
  plusText: { fontFamily: F.display, fontSize: 20, color: '#2A1600' },
  pressedAmber: { ...bevel('#7A4A00', '#FFE29A') },
  pressedMetal: { ...bevel('#121318', '#7A809A') },
  searchWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  search: {
    height: 36,
    paddingHorizontal: 12,
    backgroundColor: C.lcd,
    ...sunken,
    fontFamily: F.mono,
    fontSize: 13,
    color: C.green,
    outlineWidth: 0,
  },
  row: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    backgroundColor: '#22252F',
    borderBottomWidth: 1,
    borderBottomColor: '#2E3240',
  },
  rowSelected: { backgroundColor: '#050805' },
  rowNum: { width: 18, fontFamily: F.mono, fontSize: 12, color: '#6A7088' },
  rowLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowName: { flex: 1, fontFamily: F.bold, fontSize: 15, color: C.green },
  rowTime: { fontFamily: F.mono, fontSize: 11, color: C.dim2 },
  rowPreview: { flex: 1, fontFamily: F.body, fontSize: 13, color: C.dim },
  unread: {
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    backgroundColor: C.amber,
    fontFamily: F.mono,
    fontSize: 11,
    lineHeight: 20,
    textAlign: 'center',
    color: '#1A1200',
  },
  isNew: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: C.lcd, fontFamily: F.mono, fontSize: 10, color: C.yellow },
  chatHeaderRow: { height: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  square: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...metalButton },
  squareGlyph: { fontFamily: F.mono, fontSize: 20, color: '#DDE2EE' },
  titleLcd: { flex: 1, minWidth: 0, backgroundColor: C.lcd, paddingHorizontal: 10, paddingVertical: 4 },
  titleLcdName: { fontFamily: F.display, fontSize: 16, color: C.green },
  titleLcdSub: { fontFamily: F.mono, fontSize: 12, color: C.yellow },
  composer: { borderTopWidth: 1, borderTopColor: '#6A7088', paddingTop: 8, paddingHorizontal: 10 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  field: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 4,
    backgroundColor: C.lcd,
    ...sunken,
  },
  fieldInput: { flex: 1, maxHeight: 120, paddingVertical: 9, fontFamily: F.mono, fontSize: 14, color: C.green, outlineWidth: 0 },
  tool: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...metalButton },
  send: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...amberButton },
  tabBar: { flexDirection: 'row', gap: 8, paddingTop: 8, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: '#6A7088' },
  tab: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabOn: { backgroundColor: C.lcd },
  tabGlyph: { fontFamily: F.mono, fontSize: 16, color: '#B6BBCB' },
  tabLabel: { fontFamily: F.bold, fontSize: 11, color: '#B6BBCB' },
  day: { backgroundColor: C.lcd, paddingHorizontal: 10, paddingVertical: 3, fontFamily: F.mono, fontSize: 11, color: C.green },
  service: {
    maxWidth: 320,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#5A6078',
    fontFamily: F.body,
    fontSize: 13,
    color: '#B6BBCB',
    textAlign: 'center',
  },
  typingName: { fontFamily: F.bold, fontSize: 12, color: '#B8F57C' },
  typing: {
    height: 26,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#22252F',
    borderWidth: 1,
    borderColor: '#2E3240',
  },
});
