import { useMemo, useRef, useState } from 'react';
import { FlatList, Platform, Pressable, Text, TextInput, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import { authorColor, clockTime } from '../y2k';
import { useConference } from './ConferenceProvider';

// The conference's own chat: only for the people in the room, gone when it ends.
// (The chat the conference was started from stays as it was.)
export function ConfChat({ onClose }: { onClose?: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const { me } = useMessenger();
  const { conf, sendChat } = useConference();
  const [text, setText] = useState('');
  const items = useMemo(() => [...(conf?.chat ?? [])].reverse(), [conf?.chat]);

  function send() {
    if (!text.trim()) return;
    sendChat(text);
    setText('');
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
        <Text style={styles.headText}>Чат конференции</Text>
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
        renderItem={({ item: m }) => (
          <View style={styles.msg}>
            <Text style={styles.meta}>
              <Text style={[styles.author, { color: m.userId === me.id ? '#9BE7FF' : authorColor(m.name, skin) }]}>{m.userId === me.id ? 'Я' : m.name}</Text>
              {'  '}
              {clockTime(m.at)}
            </Text>
            <Text style={styles.body}>{m.text}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>Здесь переписка только этой конференции: её видят участники, и она исчезнет, когда все выйдут.</Text>}
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
          maxLength={2000}
        />
        <Pressable onPress={send} disabled={!text.trim()} style={[styles.send, !text.trim() && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel="Отправить">
          <Text style={styles.sendText}>➤</Text>
        </Pressable>
      </View>
    </View>
  );
}

// How many lines came in from others while the panel was closed.
export function useUnseen(open: boolean) {
  const { me } = useMessenger();
  const { conf } = useConference();
  const chat = conf?.chat ?? [];
  const seen = useRef(0);
  const lastId = chat[chat.length - 1]?.id ?? 0;
  if (!conf) seen.current = 0;
  else if (open) seen.current = lastId;
  return chat.filter((m) => m.id > seen.current && m.userId !== me.id).length;
}

const useStyles = makeStyles(({ fonts }) => ({
  panel: { flex: 1, backgroundColor: '#1C1930', borderRadius: 16, overflow: 'hidden', minHeight: 0 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headText: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: '#FFFFFF' },
  close: { fontSize: 18, color: 'rgba(255,255,255,0.7)' },
  list: { padding: 12, gap: 10, flexGrow: 1 },
  msg: { gap: 1 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.45)' },
  author: { fontFamily: fonts.bodyBold, fontSize: 13 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: '#F2F0FA' },
  empty: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 10 },
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
