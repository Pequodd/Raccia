import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Lollipop, Plastic } from '../components/y2k';
import { formatDuration } from '../media/circleUi';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import { plural } from '../y2k';
import { RoundButton, StreamView } from './CallScreen';
import { useConference, type ConfPeer } from './ConferenceProvider';

type Tile = { key: string; name: string; avatar: string | null; stream: MediaStream | null; mine: boolean; screen: boolean; showVideo: boolean };

function TileView({ tile, big }: { tile: Tile; big?: boolean }) {
  const styles = useStyles();
  const win = useWindowDimensions();
  // The big tile leaves room for the row of small ones and the buttons.
  const bigHeight = Math.min((win.width - 20) * 0.625, win.height * 0.5);
  return (
    <View style={[styles.tile, big ? [styles.tileBig, { height: bigHeight }] : styles.tileSmall]}>
      {tile.showVideo && tile.stream ? (
        <StreamView stream={tile.stream} kind="video" muted={tile.mine} mirrored={tile.mine && !tile.screen} style={tile.screen ? { objectFit: 'contain', background: '#000' } : undefined} />
      ) : (
        <View style={styles.tileAvatar}>
          <Lollipop name={tile.name} size={big ? 96 : 64} avatar={tile.avatar} />
        </View>
      )}
      {/* Audio of others plays even when their tile shows an avatar. */}
      {!tile.mine && tile.stream && !tile.showVideo ? <StreamView stream={tile.stream} kind="audio" /> : null}
      <Text style={styles.tileName} numberOfLines={1}>
        {tile.screen ? '🖥 ' : ''}
        {tile.mine ? 'Вы' : tile.name}
      </Text>
    </View>
  );
}

export function ConferenceScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { me } = useMessenger();
  const { conf, invite, joining, error, canShareScreen, join, dismissInvite, leave, toggleMute, toggleCamera, toggleScreen, toggleScreenAudio } = useConference();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!conf) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [conf]);

  const tiles = useMemo<Tile[]>(() => {
    if (!conf) return [];
    const mine: Tile = {
      key: 'me',
      name: me.name,
      avatar: me.avatar,
      stream: conf.sharing ? conf.screen : conf.local,
      mine: true,
      screen: conf.sharing,
      showVideo: conf.sharing || (conf.info.video && !conf.cameraOff),
    };
    const others = Object.values(conf.peers).map((p: ConfPeer) => ({
      key: String(p.id),
      name: p.name,
      avatar: p.avatar,
      stream: p.stream,
      mine: false,
      screen: p.screen,
      showVideo: (conf.info.video || p.screen) && (p.stream?.getVideoTracks().length ?? 0) > 0,
    }));
    return [mine, ...others];
  }, [conf, me.name, me.avatar]);

  if (!conf) {
    return (
      <>
        {invite ? (
          <Modal visible transparent animationType="fade" onRequestClose={dismissInvite}>
            <View style={styles.inviteScrim}>
              <View style={styles.invite}>
                <Lollipop name={invite.host.name} size={72} avatar={invite.host.avatar} />
                <Text style={styles.inviteTitle}>{invite.title}</Text>
                <Text style={styles.inviteText}>
                  {invite.host.name} зовёт в {invite.video ? 'видеоконференцию' : 'аудиоконференцию'}
                </Text>
                <View style={styles.inviteButtons}>
                  <RoundButton glyph="hangup" label="Не сейчас" tone="red" onPress={dismissInvite} />
                  <RoundButton glyph={invite.video ? 'cam' : 'phone'} label="Войти" tone="green" onPress={() => join(invite.id, invite.video)} />
                </View>
              </View>
            </View>
          </Modal>
        ) : null}
        {error || joining ? (
          <View style={[styles.toastWrap, { top: insets.top + 10 }]} pointerEvents="none">
            <Text style={styles.toast}>{error ?? 'Подключаемся к конференции…'}</Text>
          </View>
        ) : null}
      </>
    );
  }

  const count = tiles.length;
  const presenter = tiles.find((t) => t.screen);
  const rest = presenter ? tiles.filter((t) => t !== presenter) : tiles;

  return (
    <View style={styles.overlay}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title} numberOfLines={1}>
          {conf.info.title}
        </Text>
        <Text style={styles.sub}>
          {count} {plural(count, 'участник', 'участника', 'участников')} · {formatDuration(now - conf.startedAt)}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {presenter ? <TileView tile={presenter} big /> : null}
        <View style={styles.row}>
          {rest.map((t) => (
            <TileView key={t.key} tile={t} big={!presenter && count <= 2} />
          ))}
        </View>
      </ScrollView>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        <RoundButton glyph={conf.muted ? 'micOff' : 'mic'} label={conf.muted ? 'Микрофон выкл.' : 'Микрофон'} onPress={toggleMute} active={conf.muted} />
        {conf.info.video ? (
          <RoundButton glyph={conf.cameraOff ? 'camOff' : 'cam'} label={conf.cameraOff ? 'Камера выкл.' : 'Камера'} onPress={toggleCamera} active={conf.cameraOff} />
        ) : null}
        {canShareScreen ? <RoundButton glyph="screen" label={conf.sharing ? 'Остановить показ' : 'Показать экран'} onPress={toggleScreen} active={conf.sharing} /> : null}
        {conf.sharing ? (
          <RoundButton
            glyph={conf.screenAudio === 'on' ? 'sound' : 'soundOff'}
            label={conf.screenAudio === 'on' ? 'Звук экрана' : 'Звук экрана выкл.'}
            onPress={toggleScreenAudio}
            active={conf.screenAudio !== 'on'}
          />
        ) : null}
        <RoundButton glyph="hangup" label="Выйти" tone="red" onPress={leave} />
      </View>
    </View>
  );
}

// From the main screen: pick a chat and audio or video.
export function ConferenceSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const insets = useSafeAreaInsets();
  const { chats, me } = useMessenger();
  const { start } = useConference();
  const [chatId, setChatId] = useState<number | null>(null);
  const sorted = useMemo(() => [...chats].sort((a, b) => (a.type === b.type ? 0 : a.type === 'group' ? -1 : 1)), [chats]);
  const go = (video: boolean) => {
    if (chatId == null) return;
    onClose();
    start(chatId, video);
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetScrim} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.sheetTitle}>Конференция</Text>
        <Text style={styles.sheetText}>Выберите чат: всех его участников позовём, они войдут кнопкой. До 8 человек, с демонстрацией экрана с компьютера.</Text>
        <ScrollView style={{ flexGrow: 0, maxHeight: 320 }} contentContainerStyle={{ gap: 4 }}>
          {sorted.map((c) => {
            const on = chatId === c.id;
            const other = c.type === 'direct' ? c.members.find((m) => m.id !== me.id) : undefined;
            return (
              <Pressable key={c.id} onPress={() => setChatId(c.id)} style={[styles.chat, on && styles.chatOn]} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={c.title}>
                <Lollipop name={c.title} size={36} avatar={other?.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  <Text style={styles.chatSub}>
                    {c.members.length} {plural(c.members.length, 'участник', 'участника', 'участников')}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.sheetButtons}>
          <Plastic colors={skin.roles.action.grad} style={styles.sheetButton} onPress={() => go(false)} disabled={chatId == null} accessibilityLabel="Аудиоконференция">
            <Text style={[styles.sheetButtonText, { color: skin.roles.action.text }]}>🎧 Аудио</Text>
          </Plastic>
          <Plastic colors={skin.roles.cta.grad} style={styles.sheetButton} onPress={() => go(true)} disabled={chatId == null} accessibilityLabel="Видеоконференция">
            <Text style={[styles.sheetButtonText, { color: skin.roles.cta.text }]}>📹 Видео</Text>
          </Plastic>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ fonts, colors, frames }) => ({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 100, backgroundColor: '#141220' },
  header: { alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 2 },
  title: { fontFamily: fonts.display, fontSize: 22, color: '#FFFFFF' },
  sub: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  grid: { padding: 10, gap: 8, flexGrow: 1, justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  tile: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#24213A' },
  tileBig: { width: '100%', maxWidth: 900, alignSelf: 'center' },
  tileSmall: { width: 168, height: 128 },
  tileAvatar: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileName: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    maxWidth: '85%',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    color: '#FFFFFF',
    fontFamily: fonts.bodyBold,
    fontSize: 13,
  },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingTop: 10, flexWrap: 'wrap' },
  inviteScrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.7)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  invite: { width: '100%', maxWidth: 360, padding: 22, gap: 10, alignItems: 'center', borderRadius: 24, backgroundColor: '#1F1C33' },
  inviteTitle: { fontFamily: fonts.display, fontSize: 22, color: '#FFFFFF', textAlign: 'center' },
  inviteText: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  inviteButtons: { flexDirection: 'row', gap: 30, marginTop: 10 },
  toastWrap: { position: 'absolute', left: 0, right: 0, zIndex: 100, alignItems: 'center' },
  toast: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FFFFFF', backgroundColor: 'rgba(20,18,32,0.88)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 18, overflow: 'hidden' },
  sheetScrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 10,
    backgroundColor: colors.screen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0 -8px 30px rgba(0,0,0,0.3)',
    ...frames.card,
  },
  sheetTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  sheetText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text2 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  chatOn: { borderColor: colors.focus, backgroundColor: colors.surface },
  chatTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  chatSub: { fontFamily: fonts.body, fontSize: 12, color: colors.text3 },
  sheetButtons: { flexDirection: 'row', gap: 10 },
  sheetButton: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  sheetButtonText: { fontFamily: fonts.display, fontSize: 17 },
}));
