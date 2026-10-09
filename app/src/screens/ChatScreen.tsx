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
import { ForwardSheet, MessageActions } from '../components/forward';
import { MeetupCard, MeetupSheet } from '../components/meetup';
import { useCalls } from '../calls/CallProvider';
import { CallButtons } from '../calls/CallButtons';
import { UserCard } from '../components/profile';
import { CircleRecorder } from '../media/CircleRecorder';
import { AttachPreview, AttachSheet, RecordingBar, ToolButton } from '../media/ComposerTools';
import { MediaContent, type MediaView } from '../media/MediaViews';
import { draftFromFile, pickAttachment, PickError } from '../media/pick';
import { mediaUrl } from '../media/upload';
import { useVoiceRecorder } from '../media/useVoiceRecorder';
import { Chrome, ChromeButton, Icon, Lollipop, Plastic, Ticks } from '../components/y2k';
import { makeStyles, radius, useSkin } from '../skins';
import { useParts } from '../parts';
import { useMessenger } from '../store';
import { MEDIA_KINDS, type MediaDraft, type MediaKind, type Message, type PendingMessage } from '../types';
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
  const { chats, messages, pending, me, typing, loadMessages, sendMessage, sendMedia, retryMessage, markRead, notifyTyping } =
    useMessenger();
  const chat = chats.find((c) => c.id === chatId);
  const bucket = messages[chatId];
  const queued = pending[chatId];
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const parts = useParts();
  const [profileId, setProfileId] = useState<number | null>(null);
  const calls = useCalls();
  const [attaching, setAttaching] = useState(false);
  const [draft, setDraft] = useState<MediaDraft | null>(null);
  const [circling, setCircling] = useState(false);
  const [meeting, setMeeting] = useState(false);
  const [acting, setActing] = useState<Message | null>(null); // long-pressed message
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const voice = useVoiceRecorder();
  useEffect(() => {
    if (voice.error) setError(voice.error);
  }, [voice.error]);

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
  const openProfile = other ? () => setProfileId(other.id) : undefined;
  const startCall = other ? (video: boolean) => calls.start(chatId, video, { name: chat.title, avatar: other.avatar }) : undefined;
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

  async function pick(source: 'library' | 'camera') {
    setError(null);
    try {
      const picked = await pickAttachment(source);
      if (picked) setDraft(picked);
    } catch (e) {
      setError(e instanceof PickError ? e.message : 'Не получилось открыть файл. Попробуйте другой.');
    }
  }

  async function pickFile(file: File) {
    setError(null);
    try {
      setDraft(await draftFromFile(file));
    } catch (e) {
      setError(e instanceof PickError ? e.message : 'Не получилось открыть файл. Попробуйте другой.');
    }
  }

  async function startVoice() {
    setError(null);
    await voice.start();
  }

  async function sendVoice() {
    const rec = await voice.stop();
    if (rec) sendMedia(chatId, { kind: 'voice', uri: rec.uri, blob: rec.blob, mime: rec.mime, duration: rec.duration });
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
      case 'pending': {
        const draftMedia = item.item.media;
        const uploading = item.item.failed ? undefined : (item.item.progress ?? 0);
        if (draftMedia?.kind === 'circle' && !item.item.failed) {
          return (
            <View style={[styles.circleRow, { alignItems: 'flex-end' }]}>
              <MediaContent media={draftMedia} mine progress={uploading} />
            </View>
          );
        }
        return (
          <Bubble mine tail failed={item.item.failed} media={!!draftMedia}>
            {draftMedia ? <MediaContent media={draftMedia} mine progress={uploading} /> : null}
            {item.item.body ? <Text style={[styles.textMine, draftMedia && styles.captionPad]}>{item.item.body}</Text> : null}
            {item.item.failed ? (
              <Pressable onPress={() => retryMessage(item.item)} style={styles.failRow} accessibilityRole="button">
                <View style={styles.failMark}>
                  <Text style={styles.failMarkText}>!</Text>
                </View>
                <Text style={styles.failText}>{skin.copy.errorPrefix} Повторить</Text>
              </Pressable>
            ) : (
              <Text style={[styles.metaMine, draftMedia && styles.captionPad]}>Передаём… · {clockTime(item.item.createdAt)}</Text>
            )}
          </Bubble>
        );
      }
      case 'message': {
        const m = item.message;
        const mine = m.userId === me.id;
        if (m.kind === 'call') {
          const missed = m.media && 'outcome' in m.media && (m.media as { outcome?: string }).outcome !== 'ended';
          const video = !!(m.media as { video?: boolean } | null)?.video;
          return (
            <View style={styles.serviceRow}>
              <Pressable
                onPress={() => startCall?.(video)}
                disabled={!startCall}
                style={[styles.callPill, missed && !mine && styles.callPillMissed]}
                accessibilityRole="button"
                accessibilityLabel={`${m.body}. Перезвонить`}
              >
                <Text style={[styles.callPillText, missed && !mine && { color: colors.dangerText }]}>
                  {video ? '📹' : '📞'} {mine ? 'Исходящий: ' : ''}
                  {m.body} · {clockTime(m.createdAt)}
                </Text>
              </Pressable>
            </View>
          );
        }
        if (m.kind === 'meetup') {
          return (
            <Pressable onLongPress={() => setActing(m)} delayLongPress={400}>
              <MeetupCard message={m} />
            </Pressable>
          );
        }
        const media: MediaView | null =
          m.media && MEDIA_KINDS.includes(m.kind)
            ? {
                kind: m.kind as MediaKind,
                uri: mediaUrl(m.media.file),
                poster: m.media.poster ? mediaUrl(m.media.poster) : undefined,
                width: m.media.width,
                height: m.media.height,
                duration: m.media.duration,
              }
            : null;
        const forwarded = m.forwardedFrom ? (
          <Text style={[styles.forwarded, { color: mine ? skin.bubbles.mine.meta : skin.bubbles.theirs.meta }, media && styles.captionPad]} numberOfLines={1}>
            ↪ Переслано от {m.forwardedFrom}
          </Text>
        ) : null;
        if (media?.kind === 'circle') {
          return (
            <Pressable onLongPress={() => setActing(m)} delayLongPress={400} style={[styles.circleRow, { alignItems: mine ? 'flex-end' : 'flex-start' }]}>
              {forwarded}
              {!mine && item.showAuthor ? <Text style={[styles.author, { color: authorColor(m.name, skin) }]}>{m.name}</Text> : null}
              <MediaContent media={media} mine={mine} />
              <Text style={styles.circleMeta}>
                {mine ? `${skin.copy.ticks[ticksFor(m.id) - 1]} · ` : ''}
                {clockTime(m.createdAt)}
              </Text>
            </Pressable>
          );
        }
        if (mine) {
          const ticks = ticksFor(m.id);
          return (
            <Bubble mine tail={item.tail} media={!!media} onLongPress={() => setActing(m)}>
              {forwarded}
              {media ? <MediaContent media={media} mine /> : null}
              {m.body ? <Text style={[styles.textMine, media && styles.captionPad]}>{m.body}</Text> : null}
              <View style={[styles.metaRow, media && styles.captionPad]}>
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
          <Bubble mine={false} tail={item.tail} media={!!media} onLongPress={() => setActing(m)}>
            {item.showAuthor ? <Text style={[styles.author, { color: authorColor(m.name, skin) }, media && styles.captionPad]}>{m.name}</Text> : null}
            {forwarded}
            {media ? <MediaContent media={media} mine={false} /> : null}
            {m.body ? <Text style={[styles.textTheirs, media && styles.captionPad]}>{m.body}</Text> : null}
            <Text style={[styles.metaTheirs, media && styles.captionPad]}>{clockTime(m.createdAt)}</Text>
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
          onOpenProfile={openProfile}
          onCall={startCall}
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
            <Pressable
              onPress={openProfile}
              disabled={!openProfile}
              style={[styles.headerTitles, wide && { alignItems: 'flex-start' }]}
              accessibilityRole={openProfile ? 'button' : undefined}
              accessibilityLabel={openProfile ? `Профиль: ${chat.title}` : undefined}
            >
              <Text numberOfLines={1} style={styles.headerTitle}>
                {chat.title}
              </Text>
              <Text numberOfLines={1} style={styles.headerSubtitle}>
                {subtitle}
              </Text>
            </Pressable>
            {startCall ? <CallButtons onCall={startCall} /> : null}
            {wide ? null : (
              <Pressable onPress={openProfile} disabled={!openProfile} accessibilityLabel={openProfile ? `Профиль: ${chat.title}` : undefined}>
                <Lollipop name={chat.title} size={38} online={other?.online} avatar={other?.avatar} />
              </Pressable>
            )}
          </View>
        </Chrome>
      )}

      <UserCard userId={profileId} onClose={() => setProfileId(null)} />
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

      <AttachSheet
        visible={attaching}
        onPick={pick}
        onFile={pickFile}
        onMeetup={() => setMeeting(true)}
        onClose={() => setAttaching(false)}
      />
      <MeetupSheet chatId={chatId} visible={meeting} onClose={() => setMeeting(false)} />
      <MessageActions message={acting} onForward={setForwarding} onClose={() => setActing(null)} />
      <ForwardSheet message={forwarding} onClose={() => setForwarding(null)} />
      <AttachPreview
        draft={draft}
        onClose={() => setDraft(null)}
        onSend={(d) => {
          setDraft(null);
          sendMedia(chatId, d);
        }}
      />
      <CircleRecorder visible={circling} onClose={() => setCircling(false)} onDone={(d) => sendMedia(chatId, d)} />

      {voice.recording ? (
        <RecordingBar elapsed={voice.elapsed} onCancel={voice.cancel} onSend={sendVoice} bottomInset={insets.bottom} />
      ) : parts.Composer ? (
        <parts.Composer
          onAttach={() => setAttaching(true)}
          onMic={startVoice}
          onCircle={() => setCircling(true)}
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
            <ToolButton icon="attach" label="Прикрепить фото или видео" onPress={() => setAttaching(true)} />
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
            {text.trim() ? (
              <Plastic
                colors={roles.action.grad}
                style={styles.send}
                onPress={submit}
                accessibilityLabel={skin.copy.send}
                shadow="0 3px 8px rgba(0,112,138,0.35)"
              >
                <Text style={styles.sendText}>{skin.copy.send}</Text>
              </Plastic>
            ) : (
              <>
                <ToolButton icon="mic" label="Записать голосовое" onPress={startVoice} />
                <ToolButton icon="circle" label="Записать кружок" onPress={() => setCircling(true)} />
              </>
            )}
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
  media,
  onLongPress,
  children,
}: {
  mine: boolean;
  tail: boolean;
  failed?: boolean;
  media?: boolean; // an attachment: the picture goes almost edge to edge
  onLongPress?: () => void; // forward / copy
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
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={400}
        disabled={!onLongPress}
        style={[
          styles.bubble,
          corners,
          shine ? (mine ? styles.bubbleMineShadow : styles.bubbleTheirsShadow) : { boxShadow: 'none' },
          look.border ? { borderWidth: 1, borderColor: look.border } : null,
          failed && styles.bubbleFailed,
          media && styles.bubbleMedia,
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
      </Pressable>
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
  bubbleMedia: { paddingHorizontal: 4, paddingTop: 4, paddingBottom: 5 },
  captionPad: { paddingHorizontal: 8 },
  callPill: { maxWidth: '86%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.serviceBg },
  callPillMissed: { backgroundColor: colors.dangerBg },
  callPillText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.serviceText, textAlign: 'center' },
  forwarded: { fontFamily: fonts.bodyBold, fontSize: 12, marginBottom: 2 },
  circleRow: { gap: 3, flexShrink: 0 },
  circleMeta: { fontFamily: fonts.mono, fontSize: 11, color: colors.text3, paddingHorizontal: 8 },
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
