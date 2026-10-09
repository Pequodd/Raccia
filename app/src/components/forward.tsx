import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import type { Message } from '../types';
import { plural } from '../y2k';
import { Lollipop, Plastic } from './y2k';

// Long press on a message: forward it or copy its text.
export function MessageActions({ message, onForward, onClose }: { message: Message | null; onForward: (m: Message) => void; onClose: () => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [message]);
  if (!message) return null;
  const text = message.body.trim();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.preview} numberOfLines={2}>
          {message.name}: {text || 'вложение'}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
          onPress={() => {
            onClose();
            onForward(message);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.actionText}>↪ Переслать</Text>
        </Pressable>
        {text ? (
          <Pressable
            style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]}
            onPress={async () => {
              await Clipboard.setStringAsync(text);
              setCopied(true);
              setTimeout(onClose, 500);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.actionText}>{copied ? '✓ Скопировано' : '⧉ Скопировать текст'}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.cancel} onPress={onClose} accessibilityRole="button">
          <Text style={styles.cancelText}>Отмена</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// Pick one or more chats to forward into.
export function ForwardSheet({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const insets = useSafeAreaInsets();
  const { chats, me } = useMessenger();
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPicked([]);
    setError(null);
  }, [message]);
  if (!message) return null;

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api.forward(message!.id, picked);
      onClose();
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={[styles.sheet, styles.tall, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title}>Переслать</Text>
        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 4 }}>
          {chats.map((c) => {
            const on = picked.includes(c.id);
            const other = c.type === 'direct' ? c.members.find((m) => m.id !== me.id) : undefined;
            return (
              <Pressable
                key={c.id}
                onPress={() => toggle(c.id)}
                style={[styles.chat, on && styles.chatOn]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={c.title}
              >
                <Lollipop name={c.title} size={36} avatar={other?.avatar} />
                <Text style={styles.chatTitle} numberOfLines={1}>
                  {c.title}
                </Text>
                <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
              </Pressable>
            );
          })}
        </ScrollView>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Plastic colors={skin.roles.action.grad} style={styles.send} onPress={send} disabled={busy || !picked.length} accessibilityLabel="Переслать">
          <Text style={[styles.sendText, { color: skin.roles.action.text }]}>
            {picked.length > 1 ? `Переслать в ${picked.length} ${plural(picked.length, 'чат', 'чата', 'чатов')}` : 'Переслать'}
          </Text>
        </Plastic>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    gap: 8,
    backgroundColor: colors.screen,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    boxShadow: '0 -8px 30px rgba(0,0,0,0.3)',
    ...frames.card,
  },
  tall: { maxHeight: '80%' },
  preview: { fontFamily: fonts.body, fontSize: 13, color: colors.text3, paddingHorizontal: 6 },
  action: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  cancel: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.accentText },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.ink, paddingHorizontal: 6 },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 14 },
  chatOn: { backgroundColor: colors.surface },
  chatTitle: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.fieldBorder, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.focus, borderColor: colors.focus },
  checkMark: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.bodyHeavy },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.dangerText },
  send: { height: 48, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontFamily: fonts.display, fontSize: 17 },
}));
