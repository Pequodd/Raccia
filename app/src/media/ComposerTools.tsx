import { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Plastic } from '../components/y2k';
import { makeStyles, useSkin } from '../skins';
import type { MediaDraft } from '../types';
import { formatDuration } from './circleUi';
import { MediaContent } from './MediaViews';

export type ToolIcon = 'attach' | 'mic' | 'circle' | 'camera' | 'gallery';

export function ToolGlyph({ name, color, size = 22 }: { name: ToolIcon; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'attach' ? (
          <Path d="M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8.1 8.1a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : name === 'mic' ? (
          <>
            <Rect x={9} y={3} width={6} height={11} rx={3} stroke={color} strokeWidth={2} fill="none" />
            <Path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
          </>
        ) : name === 'circle' ? (
          <>
            <Circle cx={12} cy={12} r={8.5} stroke={color} strokeWidth={2} fill="none" />
            <Path d="M10 9v6l5-3z" fill={color} />
          </>
        ) : name === 'camera' ? (
          <>
            <Path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.5-2h4.4l1.5 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Circle cx={12} cy={12.5} r={3.3} stroke={color} strokeWidth={2} fill="none" />
          </>
        ) : (
          <>
            <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} stroke={color} strokeWidth={2} fill="none" />
            <Path d="m4 17 5-5 4 4 2.5-2.5L20 18" stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" />
            <Circle cx={15.5} cy={9} r={1.6} fill={color} />
          </>
        )}
      </Svg>
    </View>
  );
}

// Round icon button in the composer (paperclip, mic, circle).
export function ToolButton({ icon, label, onPress, color }: { icon: ToolIcon; label: string; onPress: () => void; color?: string }) {
  const styles = useStyles();
  const { colors } = useSkin();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={label} hitSlop={4}>
      <ToolGlyph name={icon} color={color ?? colors.accentText} />
    </Pressable>
  );
}

// «Скрепка»: gallery or camera.
export function AttachSheet({
  visible,
  onPick,
  onMeetup,
  onClose,
}: {
  visible: boolean;
  onPick: (source: 'library' | 'camera') => void;
  onMeetup: () => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { colors } = useSkin();
  const insets = useSafeAreaInsets();
  const options: { source: 'library' | 'camera'; icon: ToolIcon; title: string; hint: string }[] = [
    { source: 'library', icon: 'gallery', title: 'Фото или видео', hint: 'Из галереи, до 100 МБ' },
    { source: 'camera', icon: 'camera', title: 'Камера', hint: 'Снять прямо сейчас' },
  ];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        {options.map((o) => (
          <Pressable
            key={o.source}
            onPress={() => {
              onClose();
              onPick(o.source);
            }}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <View style={styles.optionIcon}>
              <ToolGlyph name={o.icon} color={colors.accentText} size={26} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{o.title}</Text>
              <Text style={styles.optionHint}>{o.hint}</Text>
            </View>
          </Pressable>
        ))}
        <Pressable
          onPress={() => {
            onClose();
            onMeetup();
          }}
          style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <View style={styles.optionIcon}>
            <Text style={{ fontSize: 24 }}>🍺</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>Сходка в бар</Text>
            <Text style={styles.optionHint}>Место и время, друзья отметятся «Иду»</Text>
          </View>
        </Pressable>
        <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
          <Text style={styles.cancelText}>Отмена</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// The picked photo or video before sending: look at it, add a caption.
export function AttachPreview({ draft, onSend, onClose }: { draft: MediaDraft | null; onSend: (d: MediaDraft) => void; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const { colors, roles } = skin;
  const insets = useSafeAreaInsets();
  const [caption, setCaption] = useState('');
  useEffect(() => setCaption(''), [draft]);
  if (!draft) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.previewScrim, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.previewMedia}>
          <MediaContent media={{ ...draft }} mine />
        </View>
        <View style={styles.previewBar}>
          <TextInput
            style={styles.caption}
            value={caption}
            onChangeText={setCaption}
            placeholder="Подпись"
            placeholderTextColor={colors.placeholder}
            maxLength={1000}
            multiline
          />
          <View style={styles.previewButtons}>
            <Pressable onPress={onClose} style={styles.cancelInline} accessibilityRole="button">
              <Text style={styles.cancelInlineText}>Отмена</Text>
            </Pressable>
            <Plastic colors={roles.action.grad} style={styles.sendBig} onPress={() => onSend({ ...draft, caption })} accessibilityLabel={skin.copy.send}>
              <Text style={[styles.sendBigText, { color: roles.action.text }]}>{skin.copy.send}</Text>
            </Plastic>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Instead of the composer while a voice message is recorded.
export function RecordingBar({ elapsed, onCancel, onSend, bottomInset }: { elapsed: number; onCancel: () => void; onSend: () => void; bottomInset: number }) {
  const styles = useStyles();
  const skin = useSkin();
  const { roles } = skin;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[styles.recBar, { paddingBottom: Math.max(bottomInset, 10) }]}>
      <Animated.View style={[styles.recDot, { opacity: pulse }]} />
      <Text style={styles.recTime}>{formatDuration(elapsed)}</Text>
      <Text style={styles.recHint} numberOfLines={1}>
        Идёт запись…
      </Text>
      <Pressable onPress={onCancel} style={styles.cancelInline} accessibilityRole="button" accessibilityLabel="Удалить запись">
        <Text style={styles.recCancel}>Удалить</Text>
      </Pressable>
      <Plastic colors={roles.action.grad} style={styles.recSend} onPress={onSend} accessibilityLabel="Отправить голосовое">
        <Text style={[styles.sendBigText, { color: roles.action.text }]}>{skin.copy.send}</Text>
      </Plastic>
    </View>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  tool: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    gap: 6,
    backgroundColor: colors.screen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0 -8px 30px rgba(0,0,0,0.3)',
    ...frames.card,
  },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 16, backgroundColor: colors.surface },
  optionIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.field },
  optionTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  optionHint: { fontFamily: fonts.body, fontSize: 13, color: colors.text3 },
  cancel: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.accentText },
  previewScrim: { flex: 1, backgroundColor: 'rgba(8,6,16,0.94)', justifyContent: 'space-between' },
  previewMedia: { flex: 1, alignItems: 'center', justifyContent: 'center', transform: [{ scale: 1.25 }] },
  previewBar: { paddingHorizontal: 14, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' },
  caption: {
    minHeight: 46,
    maxHeight: 120,
    borderRadius: 23,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.field,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  previewButtons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  cancelInline: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  cancelInlineText: { fontFamily: fonts.bodyBold, fontSize: 16, color: '#FFFFFF' },
  sendBig: { height: 46, paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center' },
  sendBigText: { fontFamily: fonts.bodyHeavy, fontSize: 16 },
  recBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    backgroundColor: colors.screen,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#FF3B3B' },
  recTime: { fontFamily: fonts.mono, fontSize: 16, color: colors.ink },
  recHint: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.text3 },
  recCancel: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.dangerText },
  recSend: { height: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
}));
