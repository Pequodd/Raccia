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
import { Header, HeaderButton } from '../components/Header';
import { useMessenger } from '../store';
import { avatarColor, formatTime, useTheme } from '../theme';
import type { Message } from '../types';

export function ChatScreen({ chatId, onBack }: { chatId: number; onBack?: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { chats, messages, me, typing, loadMessages, sendMessage, markRead, notifyTyping } = useMessenger();
  const chat = chats.find((c) => c.id === chatId);
  const bucket = messages[chatId];
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  useEffect(() => {
    setText('');
    setError(null);
    loadMessages(chatId).catch((e) => setError(e.message));
  }, [chatId, loadMessages]);

  const lastId = bucket?.items[bucket.items.length - 1]?.id;
  useEffect(() => {
    if (lastId) markRead(chatId);
  }, [chatId, lastId, markRead]);

  // Highest message id that every other member has read — drives the ✓✓ marks.
  const readByOthers = useMemo(() => {
    const others = chat?.members.filter((m) => m.id !== me.id) ?? [];
    return others.length ? Math.max(...others.map((m) => m.lastReadId)) : 0;
  }, [chat, me.id]);

  const data = useMemo(() => [...(bucket?.items ?? [])].reverse(), [bucket]);

  if (!chat) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const other = chat.type === 'direct' ? chat.members.find((m) => m.id !== me.id) : undefined;
  const t = typing[chatId];
  let subtitle: string;
  if (t) subtitle = chat.type === 'group' ? `${t.username} печатает…` : 'печатает…';
  else if (chat.type === 'group') {
    const online = chat.members.filter((m) => m.online).length;
    subtitle = `${chat.members.length} участн. · ${online} в сети`;
  } else subtitle = other?.online ? 'в сети' : 'не в сети';

  async function submit() {
    const body = text.trim();
    if (!body) return;
    setText('');
    setError(null);
    try {
      await sendMessage(chatId, body);
    } catch (e) {
      setText(body);
      setError((e as Error).message);
    }
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

  function renderItem({ item, index }: { item: Message; index: number }) {
    const mine = item.userId === me.id;
    const prev = data[index + 1]; // list is inverted: the next index is the earlier message
    const showName = chat!.type === 'group' && !mine && prev?.userId !== item.userId;
    return (
      <View style={[styles.bubbleRow, { justifyContent: mine ? 'flex-end' : 'flex-start' }]}>
        <View
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: theme.bubbleMine, borderBottomRightRadius: 4 }
              : { backgroundColor: theme.bubbleTheirs, borderBottomLeftRadius: 4 },
          ]}
        >
          {showName ? (
            <Text style={[styles.author, { color: avatarColor(item.username) }]}>{item.username}</Text>
          ) : null}
          <Text style={[styles.text, { color: mine ? theme.bubbleMineText : theme.bubbleTheirsText }]}>
            {item.body}
          </Text>
          <Text style={[styles.meta, { color: mine ? 'rgba(255,255,255,0.75)' : theme.muted }]}>
            {formatTime(item.createdAt)}
            {mine ? (readByOthers >= item.id ? '  ✓✓' : '  ✓') : ''}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header
        title={chat.title}
        subtitle={subtitle}
        left={onBack ? <HeaderButton label="‹ Чаты" onPress={onBack} /> : null}
      />
      <FlatList
        inverted
        data={data}
        keyExtractor={(m) => String(m.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onEndReached={loadOlder}
        onEndReachedThreshold={0.3}
        ListFooterComponent={loadingOlder ? <ActivityIndicator style={{ margin: 12 }} /> : null}
        ListEmptyComponent={
          bucket?.loaded ? (
            <Text style={[styles.empty, { color: theme.muted }]}>Напишите первое сообщение</Text>
          ) : (
            <ActivityIndicator style={{ margin: 24 }} />
          )
        }
      />
      {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}
      <View
        style={[
          styles.composer,
          { borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 8), backgroundColor: theme.bg },
        ]}
      >
        <TextInput
          style={[styles.input, { backgroundColor: theme.surface, color: theme.text }]}
          placeholder="Сообщение"
          placeholderTextColor={theme.muted}
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (v) notifyTyping(chatId);
          }}
          onKeyPress={onKeyPress}
          multiline
          maxLength={4000}
        />
        <Pressable
          onPress={submit}
          disabled={!text.trim()}
          style={[styles.send, { backgroundColor: theme.accent, opacity: text.trim() ? 1 : 0.4 }]}
          accessibilityLabel="Отправить"
        >
          <Text style={[styles.sendIcon, { color: theme.accentText }]}>➤</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 10, paddingVertical: 8, flexGrow: 1 },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingTop: 7, paddingBottom: 5 },
  author: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  text: { fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 11, alignSelf: 'flex-end', marginTop: 2 },
  empty: { textAlign: 'center', padding: 24, transform: [{ scaleY: -1 }] },
  error: { textAlign: 'center', paddingVertical: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 140,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    outlineWidth: 0,
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendIcon: { fontSize: 18 },
});
