import { LinearGradient } from 'expo-linear-gradient';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TitleStrip } from '../components/heroes';
import { CandidateCard, InviteCard, ResultCard, VoteCard } from '../components/initiation';
import { Chrome, Icon, Lollipop, Plastic } from '../components/y2k';
import { makeStyles, radius, useSkin } from '../skins';
import { useState } from 'react';
import { messagePreview } from '../media/upload';
import { useParts } from '../parts';
import { useMessenger } from '../store';
import type { Chat } from '../types';
import { diagonal, formatTime } from '../y2k';

export type NewChatMode = 'direct' | 'group';

export function SearchField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  return (
    <View style={styles.search}>
      <Icon name="search" size={16} color={colors.text4} />
      <TextInput
        style={styles.searchInput}
        value={value}
        onChangeText={onChange}
        placeholder={skin.copy.search}
        placeholderTextColor={colors.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

export function filterChats(chats: Chat[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return chats;
  return chats.filter(
    (c) => c.title.toLowerCase().includes(q) || c.lastMessage?.body.toLowerCase().includes(q)
  );
}

export function ChatListScreen({
  wide,
  query,
  onQuery,
  onNewChat,
}: {
  wide: boolean;
  query: string;
  onQuery: (q: string) => void;
  onNewChat: (mode: NewChatMode) => void;
}) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { chats, me, connected, activeChatId, setActiveChat, typing, votes, results } = useMessenger();
  const visible = filterChats(chats, query);
  const [inviting, setInviting] = useState(false);
  const otherVotes = Object.values(votes).filter((v) => v.candidate.id !== me.id);
  const parts = useParts();

  function renderItem({ item, index }: { item: Chat; index: number }) {
    const other = item.type === 'direct' ? item.members.find((m) => m.id !== me.id) : undefined;
    const selected = wide && item.id === activeChatId;
    const t = typing[item.id];
    const last = item.lastMessage;
    let preview = 'Эфир пуст';
    if (t) preview = item.type === 'group' ? `${t.name} ${skin.copy.typing}` : skin.copy.typing;
    else if (last?.kind === 'service') preview = last.body;
    else if (last) {
      const text = messagePreview(last);
      preview = (last.userId === me.id ? 'Я: ' : item.type === 'group' ? `${last.name}: ` : '') + text;
    }
    const ink = selected ? roles.selected.text : colors.nameText;

    if (parts.ChatRow) {
      return (
        <parts.ChatRow
          index={index}
          title={item.title}
          preview={preview}
          typing={!!t}
          time={last ? formatTime(last.createdAt) : null}
          unread={item.unread}
          isNew={other?.status === 'candidate'}
          online={!!other?.online}
          avatar={other?.avatar ?? null}
          selected={selected}
          onPress={() => setActiveChat(item.id)}
        />
      );
    }

    return (
      <Pressable
        onPress={() => setActiveChat(item.id)}
        style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && { transform: [{ scale: 0.98 }] }]}
      >
        {selected ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius(skin, 18), overflow: 'hidden' }]}>
            <LinearGradient colors={roles.selected.grad} {...diagonal} style={StyleSheet.absoluteFill} />
            {skin.shape.kind === 'glossy' ? (
              <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} style={styles.cardShine} />
            ) : null}
          </View>
        ) : null}
        <Lollipop name={item.title} online={other?.online} avatar={other?.avatar} />
        <View style={styles.cardBody}>
          <View style={styles.line}>
            <Text numberOfLines={1} style={[styles.name, { color: ink }]}>
              {item.title}
            </Text>
            {last ? (
              <Text style={[styles.time, selected && { color: 'rgba(255,255,255,0.85)' }]}>{formatTime(last.createdAt)}</Text>
            ) : null}
          </View>
          <View style={styles.line}>
            <Text
              numberOfLines={1}
              style={[styles.preview, t && { color: colors.accentText, fontFamily: fonts.bodyBold }, selected && { color: 'rgba(255,255,255,0.9)' }]}
            >
              {preview}
            </Text>
            {item.unread > 0 ? (
              <Plastic colors={roles.badge.grad} style={styles.badge} shadow="0 0 8px rgba(255,106,230,0.7)">
                <Text style={styles.badgeText}>{item.unread}</Text>
              </Plastic>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.root}>
      {wide ? null : parts.ListHeader ? (
        <parts.ListHeader
          myName={me.name}
          myAvatar={me.avatar}
          connected={connected}
          query={query}
          onQuery={onQuery}
          onNewChat={() => onNewChat('direct')}
          topInset={insets.top}
        />
      ) : (
        <Chrome style={[styles.header, { paddingTop: insets.top }]}>
          {skin.copy.listStrip ? <TitleStrip title={skin.copy.listStrip} /> : null}
          <View style={styles.headerRow}>
            <Lollipop name={me.name} size={38} avatar={me.avatar} />
            <View style={styles.headerTitle}>
              <Text style={styles.title}>{skin.copy.chats}</Text>
              {connected ? null : <Text style={styles.connecting}>Ищем спутник…</Text>}
            </View>
            <Plastic
              colors={roles.round.grad}
              style={styles.round}
              onPress={() => onNewChat('direct')}
              accessibilityLabel="Новый канал"
              shadow="0 3px 8px rgba(255,122,0,0.35)"
            >
              <Icon name="pencil" size={18} color={roles.round.text} />
            </Plastic>
          </View>
        </Chrome>
      )}

      <FlatList
        data={visible}
        keyExtractor={(c) => String(c.id)}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, parts.ChatRow && { gap: 0 }]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={[styles.top, parts.ChatRow && { paddingBottom: 8 }]}>
            {wide || parts.ListHeader ? null : <SearchField value={query} onChange={onQuery} />}
            <View style={styles.chips}>
              <Plastic colors={roles.chipNew.grad} style={styles.chip} onPress={() => onNewChat('direct')} accessibilityLabel="Новый канал">
                <Text style={[styles.chipText, { color: roles.chipNew.text }]}>{skin.copy.newChat}</Text>
              </Plastic>
              <Plastic colors={roles.chipInvite.grad} style={styles.chip} onPress={() => setInviting(true)} accessibilityLabel="Выдать инвайт">
                <Text style={[styles.chipText, { color: roles.chipInvite.text }]}>{skin.copy.invite}</Text>
              </Plastic>
              <Plastic colors={roles.chipGroup.grad} style={styles.chip} onPress={() => onNewChat('group')} accessibilityLabel="Тусовка">
                <Text style={[styles.chipText, { color: roles.chipGroup.text }]}>{skin.copy.newGroup}</Text>
              </Plastic>
            </View>
            {inviting ? <InviteCard onClose={() => setInviting(false)} /> : null}
            {results.map((r) => (
              <ResultCard key={r.candidateId} result={r} />
            ))}
            {me.status === 'candidate' ? <CandidateCard vote={votes[me.id]} /> : null}
            {otherVotes.map((v) => (
              <VoteCard key={v.candidate.id} vote={v} />
            ))}
            {wide && !connected ? <Text style={[styles.connecting, { textAlign: 'left' }]}>{skin.copy.noSignal}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {query ? 'В киберпространстве такого нет.' : 'Эфир пуст.\nНажми «+ Новый канал», чтобы найти абонента.'}
          </Text>
        }
      />
    </View>
  );
}

const useStyles = makeStyles(({ colors, fonts, roles, frames, bubbles }) => ({
  root: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.chromeEdge,
    boxShadow: '0 2px 6px rgba(27,21,48,0.15)',
    zIndex: 2,
  },
  headerRow: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  headerTitle: { flex: 1, alignItems: 'center' },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
    textShadowColor: colors.screen,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  connecting: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4, textAlign: 'center' },
  round: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 12, paddingBottom: 16, gap: 6 },
  top: { gap: 10, paddingTop: 10, paddingBottom: 4 },
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
    boxShadow: 'inset 0 2px 4px rgba(27,21,48,0.1)',
    ...frames.field,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.fieldText, outlineWidth: 0, height: 36 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { height: 32, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: roles.chipNew.text },
  card: {
    height: 66,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    boxShadow: '0 2px 6px rgba(27,21,48,0.08)',
    ...frames.card,
  },
  cardSelected: { borderColor: 'rgba(255,255,255,0.6)', boxShadow: '0 3px 10px rgba(0,112,138,0.35)' },
  cardShine: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%' },
  cardBody: { flex: 1, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 15 },
  time: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4 },
  preview: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text3 },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: roles.badge.text },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.text3, textAlign: 'center', padding: 28 },
}));
