import type { ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { makeStyles, useSkin } from '../skins';
import type { MediaDraft } from '../types';

export const CIRCLE_MAX_MS = 60_000;
export const CIRCLE_SIZE = 280;

export type CircleRecorderProps = { visible: boolean; onClose: () => void; onDone: (draft: MediaDraft) => void };

export function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The circle recorder's frame: round preview, a ring that fills up to 60 s, and the buttons.
export function CircleFrame({
  visible,
  children,
  recording,
  elapsed,
  error,
  onRecord,
  onStop,
  onCancel,
}: {
  visible: boolean;
  children: ReactNode;
  recording: boolean;
  elapsed: number;
  error: string | null;
  onRecord: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  const styles = useStyles();
  const { colors, roles } = useSkin();
  const insets = useSafeAreaInsets();
  const ring = CIRCLE_SIZE + 16;
  const r = ring / 2 - 4;
  const length = 2 * Math.PI * r;
  const done = Math.min(1, elapsed / CIRCLE_MAX_MS);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.hint}>{recording ? formatDuration(elapsed) : 'Кружок до минуты'}</Text>
        <View style={{ width: ring, height: ring, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={ring} height={ring} style={{ position: 'absolute' }}>
            <Circle cx={ring / 2} cy={ring / 2} r={r} stroke="rgba(255,255,255,0.18)" strokeWidth={5} fill="none" />
            {recording ? (
              <Circle
                cx={ring / 2}
                cy={ring / 2}
                r={r}
                stroke={colors.focus}
                strokeWidth={5}
                fill="none"
                strokeDasharray={`${length}`}
                strokeDashoffset={length * (1 - done)}
                strokeLinecap="round"
                transform={`rotate(-90 ${ring / 2} ${ring / 2})`}
              />
            ) : null}
          </Svg>
          <View style={styles.preview}>{children}</View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : <Text style={styles.sub}>{recording ? 'Нажмите ■, чтобы отправить' : 'Нажмите ●, чтобы начать'}</Text>}
        <View style={styles.buttons}>
          <Pressable onPress={onCancel} style={styles.side} accessibilityRole="button" accessibilityLabel="Отмена">
            <Text style={styles.sideText}>Отмена</Text>
          </Pressable>
          <Pressable
            onPress={recording ? onStop : onRecord}
            disabled={!!error}
            style={[styles.record, { backgroundColor: recording ? roles.danger.grad[1] : '#FFFFFF' }]}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Остановить и отправить' : 'Начать запись'}
          >
            {recording ? <View style={styles.stopMark} /> : <View style={styles.recMark} />}
          </Pressable>
          <View style={styles.side} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ fonts }) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(8,6,16,0.92)', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontFamily: fonts.bodyBold, fontSize: 18, color: '#FFFFFF' },
  preview: { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2, overflow: 'hidden', backgroundColor: '#000' },
  sub: { fontFamily: fonts.body, fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  error: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#FF8A8A', textAlign: 'center', paddingHorizontal: 30 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 30 },
  side: { width: 90, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  sideText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
  record: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.5)' },
  recMark: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FF3B3B' },
  stopMark: { width: 24, height: 24, borderRadius: 4, backgroundColor: '#FFFFFF' },
}));
