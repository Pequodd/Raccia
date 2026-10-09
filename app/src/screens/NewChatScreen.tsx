import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { Chrome, ChromeButton, Icon, Lollipop, Plastic } from '../components/y2k';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import type { User } from '../types';
import type { NewChatMode } from './ChatListScreen';

export function NewChatScreen({ mode, onClose, wide }: { mode: NewChatMode; onClose: () => void; wide: boolean }) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { openDirect, createGroup, setActiveChat } = useMessenger();
  const group = mode === 'group';
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Map<number, User>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .searchUsers(query.trim())
        .then((r) => !cancelled && setUsers(r.users))
        .catch(() => !cancelled && setError(skin.copy.noSignal));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    }
  }

  async function submitGroup() {
    try {
      const chat = await createGroup(title.trim(), [...selected.keys()]);
      setActiveChat(chat.id);
      onClose();
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    }
  }

  const canCreate = group && title.trim().length > 0 && selected.size > 0;

  return (
    <View style={styles.root}>
      <Chrome style={[styles.header, { paddingTop: wide ? 0 : insets.top }]}>
        <View style={styles.headerRow}>
          <ChromeButton size={38} onPress={onClose} label="Назад" icon={<Icon name="back" size={18} />} />
          <Text style={styles.title}>{group ? 'Тусовка' : 'Новый канал'}</Text>
          <View style={{ width: 38 }} />
        </View>
      </Chrome>

      <View style={styles.controls}>
        {group ? (
          <TextInput
            style={styles.input}
            placeholder="Название тусовки"
            placeholderTextColor={colors.placeholder}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
          />
        ) : null}
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.text4} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск абонента по нику…"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => String(u.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const on = selected.has(item.id);
          return (
            <Pressable
              onPress={() => pick(item)}
              style={({ pressed }) => [styles.card, on && styles.cardOn, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              <Lollipop name={item.name} size={42} online={item.online} avatar={item.avatar} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.status}>
                  @{item.username} · {item.online ? skin.copy.online : skin.copy.offline}
                </Text>
              </View>
              {group ? <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>В киберпространстве никого не нашлось.</Text>}
      />

      {group ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Plastic
            colors={roles.positive.grad}
            style={styles.create}
            onPress={submitGroup}
            disabled={!canCreate}
            accessibilityLabel="Собрать тусовку"
          >
            <Text style={styles.createText}>
              Собрать тусовку{selected.size ? ` · ${selected.size + 1}` : ''}
            </Text>
          </Plastic>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors, fonts, roles, frames, bubbles }) => ({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, borderBottomColor: colors.chromeEdge, boxShadow: '0 2px 6px rgba(27,21,48,0.15)', zIndex: 2 },
  headerRow: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  title: { flex: 1, textAlign: 'center', fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  controls: { padding: 12, gap: 10 },
  input: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 16,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  search: {
    height: 38,
    borderRadius: 19,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    ...frames.field,
  },
  searchInput: { flex: 1, height: 36, fontFamily: fonts.body, fontSize: 14, color: colors.fieldText, outlineWidth: 0 },
  error: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.dangerText },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 6 },
  card: {
    height: 62,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...frames.card,
  },
  cardOn: { borderColor: colors.limeAccent, backgroundColor: colors.okBg },
  name: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.ink },
  status: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.chromeEdge, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.limeAccent, borderColor: colors.limeAccent },
  checkMark: { color: colors.white, fontFamily: fonts.bodyHeavy, fontSize: 13 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.text3, textAlign: 'center', padding: 24 },
  footer: { paddingHorizontal: 12, paddingTop: 8 },
  create: { height: 52, alignItems: 'center', justifyContent: 'center' },
  createText: { fontFamily: fonts.display, fontSize: 18, color: roles.positive.text },
}));
