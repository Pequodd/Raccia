import { createElement, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Lollipop } from '../components/y2k';
import { formatDuration } from '../media/circleUi';
import { makeStyles } from '../skins';
import { useCalls, type CallState } from './CallProvider';

// A <video>/<audio> element fed by a MediaStream (web only).
export function StreamView({ stream, kind, mirrored, muted, style }: { stream: MediaStream | null; kind: 'video' | 'audio'; mirrored?: boolean; muted?: boolean; style?: object }) {
  if (Platform.OS !== 'web' || !stream) return null;
  return createElement(kind, {
    ref: (el: HTMLMediaElement | null) => {
      if (el && el.srcObject !== stream) {
        el.srcObject = stream;
        el.play?.().catch(() => {});
      }
    },
    autoPlay: true,
    playsInline: true,
    muted,
    style: kind === 'video' ? { width: '100%', height: '100%', objectFit: 'cover', transform: mirrored ? 'scaleX(-1)' : undefined, ...style } : { display: 'none' },
  });
}

export type Glyph = 'phone' | 'hangup' | 'mic' | 'micOff' | 'cam' | 'camOff' | 'flip' | 'screen' | 'sound' | 'soundOff' | 'chat' | 'cinema' | 'expand' | 'collapse';
const GLYPHS: Record<Glyph, string> = {
  phone: 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z',
  hangup: 'M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.5 11.5 0 0 0-2.66 1.85 1 1 0 0 1-1.41 0L.29 13.1a1 1 0 0 1 0-1.41A16.9 16.9 0 0 1 12 7c4.6 0 8.75 1.83 11.7 4.7a1 1 0 0 1 0 1.4l-2.48 2.48a1 1 0 0 1-1.41 0 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z',
  mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5.3-3a5.3 5.3 0 0 1-10.6 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z',
  micOff: 'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23A6.9 6.9 0 0 0 19 11zm-4.02.17L9 5.18V5a3 3 0 0 1 6 0v6zM4.27 3 3 4.27l6 6V11a3 3 0 0 0 4.06 2.8l1.66 1.66A5.3 5.3 0 0 1 6.7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08a6.9 6.9 0 0 0 2.54-.9L19.73 21 21 19.73z',
  cam: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z',
  camOff: 'M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.82L21 17.18zM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.21 0 .39-.08.55-.18L19.73 21 21 19.73z',
  screen: 'M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H8v2h8v-2h-2v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H4V5h16zM11 7.5V10H8v2h3v2.5l3.5-3.5z',
  sound: 'M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.47 4.47 0 0 0 2.5-4zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z',
  soundOff: 'M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0a6.9 6.9 0 0 1-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25A7 7 0 0 1 14 18.7v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z',
  chat: 'M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2zm3 5v2h10V9zm0 4v2h7v-2z',
  cinema: 'M3 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm16 0h3v14h-3z',
  expand: 'M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z',
  collapse: 'M8 4h2v6H4V8h4zm6 0h2v4h4v2h-6zM4 14h6v6H8v-4H4zm10 0h6v2h-4v4h-2z',
  flip: 'M20 5h-3.2L15 3H9L7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-5 11.5V14H9v2.5L5.5 13 9 9.5V12h6V9.5l3.5 3.5z',
};

export function RoundButton({
  glyph,
  label,
  onPress,
  tone = 'dim',
  active,
  badge,
}: {
  glyph: Glyph;
  label: string;
  onPress: () => void;
  tone?: 'dim' | 'red' | 'green';
  active?: boolean;
  badge?: number;
}) {
  const styles = useStyles();
  const bg = tone === 'red' ? '#E5393B' : tone === 'green' ? '#2FBF4F' : active ? '#FFFFFF' : 'rgba(255,255,255,0.18)';
  const fg = tone === 'dim' && active ? '#141220' : '#FFFFFF';
  return (
    <View style={styles.buttonWrap}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.round, { backgroundColor: bg }, pressed && { transform: [{ scale: 0.94 }] }]} accessibilityRole="button" accessibilityLabel={label}>
        <Svg width={28} height={28} viewBox="0 0 24 24">
          <Path d={GLYPHS[glyph]} fill={fg} />
        </Svg>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </Pressable>
      <Text style={styles.buttonLabel}>{label}</Text>
    </View>
  );
}

function statusText(call: CallState, now: number) {
  switch (call.status) {
    case 'outgoing':
      return call.info ? 'Вызываем…' : 'Соединяемся с сервером…';
    case 'incoming':
      return call.video ? 'Входящий видеозвонок' : 'Входящий звонок';
    case 'connecting':
      return 'Соединяем…';
    case 'active':
      return formatDuration(now - (call.startedAt ?? now));
  }
}

export function CallScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { call, notice, accept, decline, hangup, toggleMute, toggleCamera, flipCamera } = useCalls();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!call) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call]);

  if (!call) {
    return notice ? (
      <View style={[styles.toastWrap, { top: insets.top + 10 }]} pointerEvents="none">
        <Text style={styles.toast}>{notice}</Text>
      </View>
    ) : null;
  }

  const remoteVideo = call.video && (call.remote?.getVideoTracks().length ?? 0) > 0 && call.status !== 'incoming';
  const localVideo = call.video && call.local && !call.cameraOff;

  return (
    <View style={styles.overlay}>
      {remoteVideo ? (
        <View style={StyleSheet.absoluteFill}>
          <StreamView stream={call.remote} kind="video" />
        </View>
      ) : (
        <StreamView stream={call.remote} kind="audio" />
      )}

      <View style={[styles.info, remoteVideo && styles.infoOnVideo, { paddingTop: insets.top + (remoteVideo ? 12 : 70) }]}>
        {remoteVideo ? null : <Lollipop name={call.peerName} size={128} avatar={call.peerAvatar} />}
        <Text style={styles.name} numberOfLines={1}>
          {call.peerName}
        </Text>
        <Text style={styles.status}>{statusText(call, now)}</Text>
      </View>

      {localVideo ? (
        <View style={[styles.pip, { top: insets.top + 12 }]}>
          <StreamView stream={call.local} kind="video" muted mirrored />
        </View>
      ) : null}

      <View style={[styles.controls, { paddingBottom: insets.bottom + 28 }]}>
        {call.status === 'incoming' ? (
          <>
            <RoundButton glyph="hangup" label="Отклонить" tone="red" onPress={decline} />
            <RoundButton glyph={call.video ? 'cam' : 'phone'} label="Ответить" tone="green" onPress={accept} />
          </>
        ) : (
          <>
            <RoundButton glyph={call.muted ? 'micOff' : 'mic'} label={call.muted ? 'Микрофон выкл.' : 'Микрофон'} onPress={toggleMute} active={call.muted} />
            {call.video ? (
              <>
                <RoundButton glyph={call.cameraOff ? 'camOff' : 'cam'} label={call.cameraOff ? 'Камера выкл.' : 'Камера'} onPress={toggleCamera} active={call.cameraOff} />
                <RoundButton glyph="flip" label="Сменить" onPress={flipCamera} />
              </>
            ) : null}
            <RoundButton glyph="hangup" label="Завершить" tone="red" onPress={hangup} />
          </>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ fonts }) => ({
  overlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 100, backgroundColor: '#141220', justifyContent: 'space-between' },
  info: { alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  infoOnVideo: { backgroundColor: 'rgba(0,0,0,0.25)', paddingBottom: 10, alignSelf: 'flex-start', width: '100%' },
  name: { fontFamily: fonts.display, fontSize: 28, color: '#FFFFFF', textAlign: 'center' },
  status: { fontFamily: fonts.body, fontSize: 17, color: 'rgba(255,255,255,0.75)' },
  pip: { position: 'absolute', right: 12, width: 108, height: 152, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 22, paddingHorizontal: 16 },
  buttonWrap: { alignItems: 'center', gap: 6, width: 76 },
  round: { width: 66, height: 66, borderRadius: 33, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -2, top: -2, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 5, backgroundColor: '#FF4D6D', alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#FFFFFF' },
  buttonLabel: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  toastWrap: { position: 'absolute', left: 0, right: 0, zIndex: 100, alignItems: 'center' },
  toast: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(20,18,32,0.88)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    overflow: 'hidden',
  },
}));
