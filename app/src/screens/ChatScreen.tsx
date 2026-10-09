import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chrome, ChromeButton, Icon, Lollipop, Plastic, Ticks } from '../components/y2k';
import { makeStyles, radius, useSkin } from '../skins';
import { useParts } from '../parts';
import { useMessenger } from '../store';
import type { Message, PendingMessage } from '../types';
import { authorColor, clockTime, dayLabel, diagonal, plural } from '../y2k';

type Row =
  | { kind: 'message'; key: string; message: Message; showAuthor: boolean; tail: boolean }
  | { kind: 'pending'; key: string; item: PendingMessage }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'typing'; key: string; name: string }
  | { kind: 'service'; key: string; message: Message };


export function ChatScreen({ chatId, onBack, wide }: { chatId: number; onBack?: () => void; wide: boolean }) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { chats, messages, pending, me, typing, loadMessages, sendMessage, retryMessage, markRead, notifyTyping } =
    useMessenger();
  const chat = chats.find((c) => c.id === chatId);
  const bucket = messages[chatId];
  const queued = pending[chatId];
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const parts = useParts();

  useEffect(() => {
    setText('');
    setError(null);
    loadMessages(chatId).catch(() => setError(skin.copy.noSignal));
  }, [chatId, loadMessages]);

  const lastId = bucket?.items[bucket.items.length - 1]?.id;
  useEffect(() => {
    if (lastId) markRead(chatId);
  }, [chatId, lastId, markRead]);

  const others = useMemo(() => chat?.members.filter((m) => m.id !== me.id) ?? [], [chat, me.id]);
  const readUpTo = Math.max(0, ...others.map((m) => m.lastReadId));
  const deliveredUpTo = Math.max(0, ...others.map((m) => m.lastDeliveredId ?? 0));
  const ticksFor = (id: number): 1 | 2 | 3 => (readUpTo >= id ? 3 : deliveredUpTo >= id ? 2 : 1);
  const lastMine = [...(bucket?.items ?? [])].reverse().find((m) => m.userId === me.id && m.kind === 'text')?.id;
  const t = typing[chatId];

  // Newest first: the list is inverted so the feed sticks to the bottom.
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (t) out.push({ kind: 'typing', key: 'typing', name: t.name });
    for (const item of [...(queued ?? [])].reverse()) out.push({ kind: 'pending', key: item.tempId, item });
    const items = bucket?.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const m = items[i];
      const prev = items[i - 1];
      const next = items[i + 1];
      const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
      if (m.kind === 'service') {
        out.push({ kind: 'service', key: String(m.id), message: m });
        if (newDay) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.createdAt) });
        continue;
      }
      out.push({
        kind: 'message',
        key: String(m.id),
        message: m,
        showAuthor: chat?.type === 'group' && m.userId !== me.id && (newDay || prev?.userId !== m.userId || prev?.kind !== 'text'),
        tail: !next || next.userId !== m.userId || next.kind !== 'text',
      });
      if (newDay) out.push({ kind: 'day', key: `day-${m.id}`, label: dayLabel(m.createdAt) });
    }
    return out;
  }, [bucket, queued, t, chat?.type, me.id]);

  if (!chat) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accentText} />
      </View>
    );
  }

  const other = chat.type === 'direct' ? others[0] : undefined;
  let subtitle: string;
  if (t) subtitle = chat.type === 'group' ? `${t.name} ${skin.copy.typing}` : skin.copy.typing;
  else if (chat.type === 'group') {
    const n = chat.members.length;
    const online = chat.members.filter((m) => m.online).length;
    subtitle = `${n} ${plural(n, 'абонент', 'абонента', 'абонентов')} · ${online} в сети`;
  } else subtitle = other?.online ? skin.copy.online : skin.copy.offline;

  function submit() {
    const body = text.trim();
    if (!body) return;
    setText('');
    sendMessage(chatId, body);
  }

  function onKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    // Web: Enter sends, Shift+Enter inserts a newline.
    const ev = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function loadOlder() {
    if (loadingOlder || !bucket?.hasMore) return;
    setLoadingOlder(true);
    try {
      await loadMessages(chatId, true);
    } finally {
      setLoadingOlder(false);
    }
  }

  function renderRow({ item }: { item: Row }) {
    switch (item.kind) {
      case 'day':
        if (parts.DayPill) return <parts.DayPill label={item.label} />;
        return (
          <View style={styles.dayRow}>
            <Chrome style={styles.dayPill}>
              <Text style={styles.dayText}>{item.label}</Text>
            </Chrome>
          </View>
        );
      case 'service':
        if (parts.Service) return <parts.Service text={item.message.body} />;
        return (
          <View style={styles.serviceRow}>
            <View style={styles.service}>
              <Text style={styles.serviceText}>{item.message.body}</Text>
            </View>
          </View>
        );
      case 'typing':
        if (parts.Typing) return <parts.Typing name={item.name} group={chat!.type === 'group'} />;
        return (
          <Bubble mine={false} tail>
            {chat!.type === 'group' ? <Text style={[styles.author, { color: authorColor(item.name, skin) }]}>{item.name}</Text> : null}
            <View style={styles.dots}>
              {[1, 0.7, 0.4].map((o) => (
                <View key={o} style={[styles.dot, { opacity: o }]} />
              ))}
            </View>
          </Bubble>
        );
      case 'pending':
        return (
          <Bubble mine tail failed={item.item.failed}>
            <Text style={styles.textMine}>{item.item.body}</Text>
            {item.item.failed ? (
              <Pressable onPress={() => retryMessage(item.item)} style={styles.failRow} accessibilityRole="button">
                <View style={styles.failMark}>
                  <Text style={styles.failMarkText}>!</Text>
                </View>
                <Text style={styles.failText}>{skin.copy.errorPrefix} Повторить</Text>
              </Pressable>
            ) : (
              <Text style={styles.metaMine}>Передаём… · {clockTime(item.item.createdAt)}</Text>
            )}
          </Bubble>
        );
      case 'message': {
        const m = item.message;
        const mine = m.userId === me.id;
        if (mine) {
          const ticks = ticksFor(m.id);
          return (
            <Bubble mine tail={item.tail}>
              <Text style={styles.textMine}>{m.body}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaMine}>
                  {m.id === lastMine ? `${skin.copy.ticks[ticks - 1]} · ` : ''}
                  {clockTime(m.createdAt)}
                </Text>
                <Ticks count={ticks} color={skin.bubbles.mine.meta} />
              </View>
            </Bubble>
          );
        }
        return (
          <Bubble mine={false} tail={item.tail}>
            {item.showAuthor ? <Text style={[styles.author, { color: authorColor(m.name, skin) }]}>{m.name}</Text> : null}
            <Text style={styles.textTheirs}>{m.body}</Text>
            <Text style={styles.metaTheirs}>{clockTime(m.createdAt)}</Text>
          </Bubble>
        );
      }
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {parts.ChatHeader ? (
        <parts.ChatHeader
          title={chat.title}
          subtitle={subtitle}
          avatar={other?.avatar ?? null}
          online={!!other?.online}
          onBack={wide ? undefined : onBack}
          wide={wide}
          topInset={insets.top}
        />
      ) : (
      <Chrome style={[styles.header, { paddingTop: wide ? 0 : insets.top }]}>
          <View style={[styles.headerRow, wide && styles.headerRowWide]}>
            {wide ? (
              <Lollipop name={chat.title} size={38} online={other?.online} avatar={other?.avatar} />
            ) : (
              <ChromeButton size={38} onPress={onBack ?? (() => {})} label="Назад" icon={<Icon name="back" size={18} />} />
            )}
            <View style={[styles.headerTitles, wide && { alignItems: 'flex-start' }]}>
              <Text numberOfLines={1} style={styles.headerTitle}>
                {chat.title}
              </Text>
              <Text numberOfLines={1} style={styles.headerSubtitle}>
                {subtitle}
              </Text>
            </View>
            {wide ? null : <Lollipop name={chat.title} size={38} online={other?.online} avatar={other?.avatar} />}
          </View>
        </Chrome>
      )}

      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        style={styles.feed}
        contentContainerStyle={[styles.feedContent, wide && styles.feedWide]}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingOlder ? <ActivityIndicator style={{ margin: 12 }} color={colors.accentText} /> : null}
        ListEmptyComponent={
          bucket?.loaded ? (
            <Text style={styles.empty}>{skin.copy.emptyFeed}</Text>
          ) : (
            <ActivityIndicator style={{ margin: 24 }} color={colors.accentText} />
          )
        }
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {parts.Composer ? (
        <parts.Composer
          value={text}
          onChange={(v) => {
            setText(v);
            if (v) notifyTyping(chatId);
          }}
          onSend={submit}
          onKeyPress={onKeyPress}
          wide={wide}
          bottomInset={insets.bottom}
        />
      ) : (
      <Chrome style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={[styles.composerRow, wide && styles.feedWide]}>
            <TextInput
              style={styles.input}
              placeholder={skin.copy.composer}
              placeholderTextColor={colors.placeholder}
              value={text}
              onChangeText={(v) => {
                setText(v);
                if (v) notifyTyping(chatId);
              }}
              onKeyPress={onKeyPress}
              multiline
              // Browsers default a textarea to two rows; start at one like the native field.
              numberOfLines={Platform.OS === 'web' ? 1 : undefined}
              maxLength={4000}
            />
            <Plastic
              colors={roles.action.grad}
              style={styles.send}
              onPress={submit}
              disabled={!text.trim()}
              accessibilityLabel={skin.copy.send}
              shadow="0 3px 8px rgba(0,112,138,0.35)"
            >
              <Text style={styles.sendText}>{skin.copy.send}</Text>
            </Plastic>
          </View>
        </Chrome>
      )}
    </KeyboardAvoidingView>
  );
}

function Bubble({
  mine,
  tail,
  failed,
  children,
}: {
  mine: boolean;
  tail: boolean;
  failed?: boolean;
  children: React.ReactNode;
}) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  const r = (v: number) => radius(skin, v);
  const corners = mine
    ? { borderTopLeftRadius: r(20), borderTopRightRadius: r(20), borderBottomLeftRadius: r(20), borderBottomRightRadius: r(tail ? 6 : 20) }
    : { borderTopLeftRadius: r(20), borderTopRightRadius: r(20), borderBottomRightRadius: r(20), borderBottomLeftRadius: r(tail ? 6 : 20) };
  const look = mine ? skin.bubbles.mine : skin.bubbles.theirs;
  const shine = skin.bubbles.shine;
  return (
    <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
      <View
        style={[
          styles.bubble,
          corners,
          shine ? (mine ? styles.bubbleMineShadow : styles.bubbleTheirsShadow) : { boxShadow: 'none' },
          look.border ? { borderWidth: 1, borderColor: look.border } : null,
          failed && styles.bubbleFailed,
        ]}
      >
        <View style={[StyleSheet.absoluteFill, corners, { overflow: 'hidden' }]} pointerEvents="none">
          <LinearGradient colors={look.grad} {...(shine ? diagonal : {})} style={StyleSheet.absoluteFill} />
          {shine ? (
            <>
              <LinearGradient colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0)']} style={styles.bubbleShine} />
              <View style={[StyleSheet.absoluteFill, corners, styles.bubbleInset]} />
            </>
          ) : null}
        </View>
        {children}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, fonts, roles, frames, bubbles }) => ({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.chromeEdge,
    boxShadow: '0 2px 6px rgba(27,21,48,0.15)',
    zIndex: 2,
  },
  headerRow: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  headerRowWide: { height: 62, paddingHorizontal: 20 },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  headerSubtitle: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.accentText },
  feed: { flex: 1 },
  feedContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 7, flexGrow: 1 },
  feedWide: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  dayRow: { alignItems: 'center', marginVertical: 4 },
  serviceRow: { alignItems: 'center', marginVertical: 2 },
  service: {
    maxWidth: '86%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.serviceBg,
  },
  serviceText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.serviceText, textAlign: 'center' },
  dayPill: {
    borderRadius: 12,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.chromeEdge,
  },
  dayText: { fontFamily: fonts.mono, fontSize: 11, color: colors.text2 },
  bubbleRow: { flexDirection: 'row', flexShrink: 0 },
  bubble: { maxWidth: '80%', paddingHorizontal: 13, paddingTop: 8, paddingBottom: 6, flexShrink: 0 },
  bubbleShine: { position: 'absolute', left: 0, right: 0, top: 0, height: 12 },
  bubbleInset: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.35), inset 0 -4px 8px rgba(0,0,0,0.12)',
  },
  bubbleMineShadow: { boxShadow: '0 3px 8px rgba(255,122,0,0.25)' },
  bubbleTheirsShadow: { boxShadow: '0 3px 8px rgba(0,106,132,0.25)' },
  bubbleFailed: { opacity: 0.7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.dangerBorder, boxShadow: 'none' },
  author: { fontFamily: fonts.bodyHeavy, fontSize: 12, marginBottom: 1 },
  textTheirs: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: bubbles.theirs.text },
  textMine: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: bubbles.mine.text },
  metaTheirs: { fontFamily: fonts.mono, fontSize: 10, color: bubbles.theirs.meta, alignSelf: 'flex-end', marginTop: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 1 },
  metaMine: { fontFamily: fonts.mono, fontSize: 10, color: bubbles.mine.meta, alignSelf: 'flex-end' },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, alignSelf: 'flex-end' },
  failMark: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  failMarkText: { color: colors.white, fontFamily: fonts.bodyHeavy, fontSize: 11 },
  failText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: colors.dangerText },
  dots: { flexDirection: 'row', gap: 5, paddingVertical: 6, paddingHorizontal: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.neon, boxShadow: `0 0 6px ${colors.neonGlow}` },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.text3, textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] },
  error: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.dangerText, textAlign: 'center', paddingVertical: 4 },
  composer: { borderTopWidth: 1, borderTopColor: colors.chromeEdge, paddingTop: 8, paddingHorizontal: 10 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    boxShadow: 'inset 0 2px 4px rgba(27,21,48,0.1)',
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  send: { height: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: fonts.display, fontSize: 15, color: roles.action.text },
}));
