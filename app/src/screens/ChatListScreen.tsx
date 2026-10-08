import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../components/Avatar';
import { Header, HeaderButton } from '../components/Header';
import { useMessenger } from '../store';
import { formatTime, useTheme } from '../theme';
import type { Chat } from '../types';

export function ChatListScreen({ onNewChat, onLogout }: { onNewChat: () => void; onLogout: () => void }) {
  const theme = useTheme();
  const { chats, me, connected, activeChatId, setActiveChat, typing } = useMessenger();

  function renderItem({ item }: { item: Chat }) {
    const other = item.type === 'direct' ? item.members.find((m) => m.id !== me.id) : undefined;
    const t = typing[item.id];
    const last = item.lastMessage;
    let preview = 'Нет сообщений';
    if (t) preview = item.type === 'group' ? `${t.username} печатает…` : 'печатает…';
    else if (last) preview = (last.userId === me.id ? 'Вы: ' : item.type === 'group' ? `${last.username}: ` : '') + last.body;
    const selected = item.id === activeChatId;

    return (
      <Pressable
        onPress={() => setActiveChat(item.id)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: selected ? theme.surface : pressed ? theme.surface : theme.bg },
        ]}
      >
        <Avatar name={item.title} online={other?.online} />
        <View style={styles.body}>
          <View style={styles.line}>
            <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
              {item.type === 'group' ? '👥 ' : ''}
              {item.title}
            </Text>
            {last ? <Text style={[styles.time, { color: theme.muted }]}>{formatTime(last.createdAt)}</Text> : null}
          </View>
          <View style={styles.line}>
            <Text numberOfLines={1} style={[styles.preview, { color: t ? theme.accent : theme.muted }]}>
              {preview}
            </Text>
            {item.unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                <Text style={[styles.badgeText, { color: theme.accentText }]}>{item.unread}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Header
        title="Чаты"
        subtitle={connected ? me.username : 'Соединение…'}
        left={<HeaderButton label="Выйти" onPress={onLogout} />}
        right={<HeaderButton label="＋ Новый" onPress={onNewChat} />}
      />
      <FlatList
        data={chats}
        keyExtractor={(c) => String(c.id)}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: theme.muted, textAlign: 'center' }}>
              Пока нет чатов.{'\n'}Нажмите «＋ Новый», чтобы найти собеседника.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 12 },
  body: { flex: 1, gap: 3 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600' },
  time: { fontSize: 12 },
  preview: { flex: 1, fontSize: 14 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  empty: { padding: 32 },
});
