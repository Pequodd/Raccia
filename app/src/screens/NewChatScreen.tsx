import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { Avatar } from '../components/Avatar';
import { Header, HeaderButton } from '../components/Header';
import { useMessenger } from '../store';
import { useTheme } from '../theme';
import type { User } from '../types';

export function NewChatScreen({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const { openDirect, createGroup, setActiveChat } = useMessenger();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [group, setGroup] = useState(false);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Map<number, User>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .searchUsers(query.trim())
        .then((r) => !cancelled && setUsers(r.users))
        .catch((e) => !cancelled && setError(e.message));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  async function pick(user: User) {
    if (group) {
      const next = new Map(selected);
      if (next.has(user.id)) next.delete(user.id);
      else next.set(user.id, user);
      setSelected(next);
      return;
    }
    try {
      const chat = await openDirect(user.id);
      setActiveChat(chat.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submitGroup() {
    try {
      const chat = await createGroup(title.trim(), [...selected.keys()]);
      setActiveChat(chat.id);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const input = [styles.input, { backgroundColor: theme.surface, color: theme.text }];
  const canCreate = group && title.trim().length > 0 && selected.size > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Header
        title={group ? 'Новая группа' : 'Новый чат'}
        left={<HeaderButton label="‹ Назад" onPress={onClose} />}
        right={canCreate ? <HeaderButton label="Создать" onPress={submitGroup} /> : null}
      />
      <View style={styles.controls}>
        <Pressable
          onPress={() => {
            setGroup(!group);
            setSelected(new Map());
          }}
          style={[styles.toggle, { borderColor: theme.accent, backgroundColor: group ? theme.accent : 'transparent' }]}
        >
          <Text style={{ color: group ? theme.accentText : theme.accent, fontWeight: '600' }}>
            {group ? '✓ Групповой чат' : 'Создать группу'}
          </Text>
        </Pressable>
        {group ? (
          <TextInput
            style={input}
            placeholder="Название группы"
            placeholderTextColor={theme.muted}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
        ) : null}
        <TextInput
          style={input}
          placeholder="Поиск по имени"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          autoFocus
        />
        {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
      </View>
      <FlatList
        data={users}
        keyExtractor={(u) => String(u.id)}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pick(item)}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surface : theme.bg }]}
          >
            <Avatar name={item.username} size={40} online={item.online} />
            <Text style={[styles.name, { color: theme.text }]}>{item.username}</Text>
            {group ? (
              <Text style={{ color: selected.has(item.id) ? theme.accent : theme.border, fontSize: 20 }}>
                {selected.has(item.id) ? '●' : '○'}
              </Text>
            ) : null}
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.muted }]}>Никого не найдено</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { padding: 12, gap: 10 },
  toggle: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7 },
  input: { height: 44, borderRadius: 10, paddingHorizontal: 12, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  name: { flex: 1, fontSize: 16 },
  empty: { textAlign: 'center', padding: 24 },
});
