import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { messagePreview } from '../media/upload';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import { authorColor, clockTime } from '../y2k';

// The conference's own chat (the chat it was started in), in the dark call style.
export function ConfChat({ chatId, onClose }: { chatId: number; onClose?: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const { messages, me, loadMessages, sendMessage, markRead } = useMessenger();
  const [text, setText] = useState('');
  const bucket = messages[chatId];
  const items = useMemo(() => [...(bucket?.items ?? [])].filter((m) => m.kind !== 'conference').slice(-80).reverse(), [bucket]);
  const lastId = bucket?.items[bucket.items.length - 1]?.id;

  useEffect(() => {
    if (!bucket?.loaded) loadMessages(chatId).catch(() => {});
  }, [chatId, bucket?.loaded, loadMessages]);
  useEffect(() => {
    if (lastId) markRead(chatId);
  }, [chatId, lastId, markRead]);

  function send() {
    const body = text.trim();
    if (!body) return;
    setText('');
    sendMessage(chatId, body);
  }
  function onKeyPress(e: NativeSyntheticEvent<TextInputKeyPressEventData>) {
    const ev = e.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <Text style={styles.headText}>Чат</Text>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Скрыть чат">
            <Text style={styles.close}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        inverted
        data={items}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.list}
        renderItem={({ item: m }) =>
          m.kind === 'service' ? (
            <Text style={styles.service}>{m.body}</Text>
          ) : (
            <View style={styles.msg}>
              <Text style={styles.meta}>
                <Text style={[styles.author, { color: m.userId === me.id ? '#9BE7FF' : authorColor(m.name, skin) }]}>{m.userId === me.id ? 'Я' : m.name}</Text>
                {'  '}
                {clockTime(m.createdAt)}
              </Text>
              <Text style={styles.body}>{m.kind === 'text' ? m.body : messagePreview(m)}</Text>
            </View>
          )
        }
        ListEmptyComponent={<Text style={styles.service}>Пишите сюда — увидят все в конференции.</Text>}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          onKeyPress={onKeyPress}
          placeholder="Сообщение…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          multiline
          numberOfLines={Platform.OS === 'web' ? 1 : undefined}
          maxLength={4000}
        />
        <Pressable onPress={send} disabled={!text.trim()} style={[styles.send, !text.trim() && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Отправить">
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

// How many messages came in while the panel was closed.
export function useUnseen(chatId: number, open: boolean) {
  const { messages, me } = useMessenger();
  const items = messages[chatId]?.items ?? [];
  const seen = useRef(items[items.length - 1]?.id ?? 0);
  if (open) seen.current = items[items.length - 1]?.id ?? seen.current;
  return items.filter((m) => m.id > seen.current && m.userId !== me.id && m.kind !== 'conference').length;
}

const useStyles = makeStyles(({ fonts }) => ({
  panel: { flex: 1, backgroundColor: '#1C1930', borderRadius: 16, overflow: 'hidden', minHeight: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headText: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: '#FFFFFF' },
  close: { fontSize: 18, color: 'rgba(255,255,255,0.7)' },
  list: { padding: 12, gap: 10 },
  msg: { gap: 1 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  author: { fontFamily: fonts.bodyBold, fontSize: 13 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: '#F2F0FA' },
  service: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFFFFF',
    fontFamily: fonts.body,
    fontSize: 15,
    outlineWidth: 0,
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2FBF4F' },
  sendText: { color: '#FFFFFF', fontSize: 18 },
}));
