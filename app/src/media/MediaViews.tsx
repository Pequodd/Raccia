import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { makeStyles, useSkin } from '../skins';
import type { MediaKind } from '../types';
import { formatDuration } from './circleUi';

// What a bubble needs to show an attachment, whether it is on the server or still uploading.
export type MediaView = {
  kind: MediaKind;
  uri: string;
  width?: number | null;
  height?: number | null;
  duration?: number | null; // ms
  poster?: string; // first frame (server-made) for videos and circles
};

// Only one voice message or circle plays at a time.
let stopCurrent: (() => void) | null = null;
function claimPlayback(stop: () => void) {
  if (stopCurrent && stopCurrent !== stop) stopCurrent();
  stopCurrent = stop;
}

const MAX_W = 240;

function boxFor(width?: number | null, height?: number | null) {
  const ratio = width && height ? Math.min(2, Math.max(0.6, width / height)) : 4 / 3;
  return ratio >= 1 ? { width: MAX_W, height: Math.round(MAX_W / ratio) } : { width: Math.round(MAX_W * ratio * 1.25), height: Math.round(MAX_W * 1.25) };
}

export function MediaContent({ media, mine, progress }: { media: MediaView; mine: boolean; progress?: number }) {
  switch (media.kind) {
    case 'image':
      return <ImageMedia media={media} progress={progress} />;
    case 'video':
      return <VideoMedia media={media} progress={progress} />;
    case 'voice':
      return <VoiceMedia media={media} mine={mine} progress={progress} />;
    case 'circle':
      return <CircleMedia media={media} progress={progress} />;
  }
}

// Upload progress over a picture or a video while it is being sent.
function Uploading({ progress, round }: { progress: number; round?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.uploading, round && { borderRadius: 999 }]} pointerEvents="none">
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.uploadingText}>{Math.round(progress * 100)}%</Text>
    </View>
  );
}

function ImageMedia({ media, progress }: { media: MediaView; progress?: number }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const box = boxFor(media.width, media.height);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel="Фото, открыть на весь экран">
        <Image source={{ uri: media.uri }} style={[styles.visual, box]} contentFit="cover" transition={150} />
        {progress !== undefined ? <Uploading progress={progress} /> : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.viewer} onPress={() => setOpen(false)} accessibilityLabel="Закрыть фото">
          <Image source={{ uri: media.uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          <Text style={[styles.viewerClose, { top: insets.top + 12 }]}>✕</Text>
        </Pressable>
      </Modal>
    </>
  );
}

function VideoMedia({ media, progress }: { media: MediaView; progress?: number }) {
  const styles = useStyles();
  const box = boxFor(media.width, media.height);
  const [started, setStarted] = useState(!media.poster);
  return (
    <View style={[styles.visual, box]}>
      {started ? (
        <VideoPlayerView media={media} box={box} />
      ) : (
        // A cover with a play button; the player appears on tap (and starts right away).
        <Pressable onPress={() => setStarted(true)} style={box} accessibilityRole="button" accessibilityLabel="Смотреть видео">
          <Image source={{ uri: media.poster }} style={box} contentFit="cover" />
          <View style={styles.playOverlay}>
            <View style={styles.playBig}>
              <PlayGlyph playing={false} color="#FFFFFF" />
            </View>
            {media.duration ? <Text style={styles.videoTime}>{formatDuration(media.duration)}</Text> : null}
          </View>
        </Pressable>
      )}
      {progress !== undefined ? <Uploading progress={progress} /> : null}
    </View>
  );
}

function VideoPlayerView({ media, box }: { media: MediaView; box: { width: number; height: number } }) {
  const player = useVideoPlayer(media.uri, (p) => {
    p.loop = false;
    if (media.poster) {
      claimPlayback(() => p.pause());
      p.play();
    }
  });
  return <VideoView player={player} style={box} contentFit="cover" nativeControls fullscreenOptions={{ enable: true }} />;
}

// Bars of a fake but stable waveform: the same message always looks the same.
function useBars(seed: string, count = 30) {
  return useMemo(() => {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return Array.from({ length: count }, (_, i) => {
      h = Math.imul(h ^ (i + 1), 2654435761);
      return 0.25 + ((h >>> 0) % 1000) / 1333;
    });
  }, [seed, count]);
}

function PlayGlyph({ playing, color }: { playing: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      {playing ? <Path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill={color} /> : <Path d="M8 5.5v13l11-6.5z" fill={color} />}
    </Svg>
  );
}

function VoiceMedia({ media, mine, progress }: { media: MediaView; mine: boolean; progress?: number }) {
  const [active, setActive] = useState(false);
  // The player is created on the first tap: a long chat full of voices stays light.
  return active ? (
    <VoicePlayer media={media} mine={mine} />
  ) : (
    <VoiceLayout media={media} mine={mine} playing={false} position={0} onToggle={() => progress === undefined && setActive(true)} busy={progress !== undefined} />
  );
}

function VoicePlayer({ media, mine }: { media: MediaView; mine: boolean }) {
  const player = useAudioPlayer(media.uri);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    const stop = () => player.pause();
    claimPlayback(stop);
    player.play();
    return () => {
      if (stopCurrent === stop) stopCurrent = null;
    };
  }, [player]);
  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
    }
  }, [status.didJustFinish, player]);
  const duration = media.duration ?? (Number.isFinite(status.duration) ? status.duration * 1000 : 0);
  return (
    <VoiceLayout
      media={media}
      mine={mine}
      playing={status.playing}
      position={duration ? Math.min(1, (status.currentTime * 1000) / duration) : 0}
      elapsed={status.currentTime * 1000}
      onToggle={() => {
        if (status.playing) player.pause();
        else {
          claimPlayback(() => player.pause());
          player.play();
        }
      }}
    />
  );
}

function VoiceLayout({
  media,
  mine,
  playing,
  position,
  elapsed,
  onToggle,
  busy,
}: {
  media: MediaView;
  mine: boolean;
  playing: boolean;
  position: number;
  elapsed?: number;
  onToggle: () => void;
  busy?: boolean;
}) {
  const styles = useStyles();
  const skin = useSkin();
  const look = mine ? skin.bubbles.mine : skin.bubbles.theirs;
  const bars = useBars(media.uri);
  const played = Math.round(position * bars.length);
  return (
    <View style={styles.voice}>
      <Pressable
        onPress={onToggle}
        disabled={busy}
        style={[styles.voiceButton, { backgroundColor: look.text }]}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Пауза' : 'Слушать голосовое'}
      >
        {busy ? <ActivityIndicator size="small" color={look.grad[1]} /> : <PlayGlyph playing={playing} color={look.grad[1]} />}
      </Pressable>
      <View style={{ gap: 4 }}>
        <View style={styles.bars}>
          {bars.map((v, i) => (
            <View key={i} style={[styles.bar, { height: 4 + v * 20, backgroundColor: look.text, opacity: i < played ? 1 : 0.4 }]} />
          ))}
        </View>
        <Text style={[styles.voiceTime, { color: look.meta }]}>
          {playing || elapsed ? formatDuration(elapsed ?? 0) + ' / ' : ''}
          {formatDuration(media.duration ?? 0)}
        </Text>
      </View>
    </View>
  );
}

const CIRCLE = 200;

function CircleMedia({ media, progress }: { media: MediaView; progress?: number }) {
  const styles = useStyles();
  const { colors } = useSkin();
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const player = useVideoPlayer(media.uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.2;
  });
  useEventListener(player, 'playingChange', ({ isPlaying }) => setPlaying(isPlaying));
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const total = (media.duration ?? player.duration * 1000) / 1000;
    if (total > 0) setPosition(Math.min(1, currentTime / total));
  });
  useEventListener(player, 'playToEnd', () => {
    player.currentTime = 0;
    setPosition(0);
  });

  const toggle = () => {
    if (progress !== undefined) return;
    if (player.playing) player.pause();
    else {
      claimPlayback(() => player.pause());
      player.muted = false;
      player.play();
    }
  };
  const ring = CIRCLE + 8;
  const r = ring / 2 - 2;
  const length = 2 * Math.PI * r;
  return (
    <Pressable onPress={toggle} style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={playing ? 'Пауза' : 'Смотреть кружок'}>
      <View style={styles.circle}>
        <VideoView player={player} style={{ width: CIRCLE, height: CIRCLE }} contentFit="cover" nativeControls={false} />
        {media.poster && !playing && position === 0 ? (
          <Image source={{ uri: media.poster }} style={{ position: 'absolute', width: CIRCLE, height: CIRCLE }} contentFit="cover" />
        ) : null}
      </View>
      <Svg width={ring} height={ring} style={{ position: 'absolute' }} pointerEvents="none">
        {position > 0 ? (
          <Circle
            cx={ring / 2}
            cy={ring / 2}
            r={r}
            stroke={colors.focus}
            strokeWidth={3}
            fill="none"
            strokeDasharray={`${length}`}
            strokeDashoffset={length * (1 - position)}
            strokeLinecap="round"
            transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
          />
        ) : null}
      </Svg>
      {!playing && progress === undefined ? (
        <View style={styles.circleBadge} pointerEvents="none">
          <PlayGlyph playing={false} color="#FFFFFF" />
          <Text style={styles.circleTime}>{formatDuration(media.duration ?? 0)}</Text>
        </View>
      ) : null}
      {progress !== undefined ? <Uploading progress={progress} round /> : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ fonts }) => ({
  visual: { borderRadius: 14, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.15)' },
  uploading: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  uploadingText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#FFFFFF' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  viewerClose: { position: 'absolute', right: 20, fontSize: 26, color: '#FFFFFF' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2, minWidth: 210 },
  voiceButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  bars: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 26 },
  bar: { width: 3, borderRadius: 2 },
  voiceTime: { fontFamily: fonts.mono, fontSize: 11 },
  playOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  playBig: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  videoTime: {
    position: 'absolute',
    left: 8,
    top: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    fontFamily: fonts.mono,
    fontSize: 11,
    color: '#FFFFFF',
  },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, overflow: 'hidden', backgroundColor: '#000' },
  circleBadge: {
    position: 'absolute',
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  circleTime: { fontFamily: fonts.mono, fontSize: 12, color: '#FFFFFF' },
}));
