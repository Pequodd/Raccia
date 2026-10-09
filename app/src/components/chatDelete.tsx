import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { api } from '../api';
import { makeStyles, useSkin } from '../skins';
import type { Chat } from '../types';
import { Plastic } from './y2k';

// Long press a chat in the list → delete it for everyone, with its photos and voices.
export function ChatDeleteSheet({ chat, onClose }: { chat: Chat | null; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!chat) return null;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteChat(chat!.id);
      onClose();
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть">
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Удалить «{chat.title}»?</Text>
          <Text style={styles.text}>
            Чат исчезнет у {chat.type === 'group' ? 'всех участников' : 'вас и у собеседника'}: сообщения, фото, видео, голосовые и кружки
            стираются с сервера без следа. Вернуть не получится.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
            <Plastic colors={skin.roles.danger.grad} style={styles.delete} onPress={remove} disabled={busy} accessibilityLabel="Удалить бесследно">
              <Text style={[styles.deleteText, { color: skin.roles.danger.text }]}>{busy ? 'Стираем…' : 'Удалить бесследно'}</Text>
            </Plastic>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  scrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.55)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 380, padding: 20, gap: 12, borderRadius: 22, backgroundColor: colors.screen, ...frames.card },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text2 },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.dangerText },
  buttons: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  cancelText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accentText },
  delete: { height: 46, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontFamily: fonts.bodyHeavy, fontSize: 15 },
}));
