import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { api } from '../api';
import { pickPhoto } from '../photo';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import type { Profile, User } from '../types';
import { plural } from '../y2k';
import { Lcd, Lollipop, Plastic } from './y2k';

export function joinedLabel(ts: number) {
  return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function statusLabel(user: Pick<User, 'status'>) {
  return user.status === 'initiated' ? 'ПОСВЯЩЁННЫЙ АБОНЕНТ' : user.status === 'candidate' ? 'КАНДИДАТ · ИДЁТ ГОЛОСОВАНИЕ' : 'НАВСЕГДА ОЛЕГ';
}

// Pick a photo, upload it, put it on the avatar. Shared by the profile and onboarding.
export function usePhotoUpload() {
  const { setMe } = useMessenger();
  const skin = useSkin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useCallback(async () => {
    setError(null);
    let blob: Blob | null;
    try {
      blob = await pickPhoto();
    } catch {
      setError('Не удалось открыть фото. Попробуйте другое.');
      return false;
    }
    if (!blob) return false;
    setBusy(true);
    try {
      const { user } = await api.uploadPhoto(blob);
      setMe(user);
      return true;
    } catch (e) {
      setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
      return false;
    } finally {
      setBusy(false);
    }
  }, [setMe, skin]);
  return { upload, busy, error };
}

// Round camera button that sits on the avatar's corner.
export function CameraButton({ onPress, busy, size = 38 }: { onPress: () => void; busy?: boolean; size?: number }) {
  const { roles } = useSkin();
  return (
    <Plastic
      colors={roles.action.grad}
      radius={size / 2}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      onPress={onPress}
      disabled={busy}
      accessibilityLabel="Загрузить фото"
    >
      <View style={{ width: size * 0.55, height: size * 0.55 }}>
        <Svg width="100%" height="100%" viewBox="0 0 24 24">
          <Path
            d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.8l1.5-2h4.4l1.5 2h1.8A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"
            stroke={roles.action.text}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
          />
          <Circle cx={12} cy={12.5} r={3.3} stroke={roles.action.text} strokeWidth={2} fill="none" />
        </Svg>
      </View>
    </Plastic>
  );
}

// Three facts under the name: since when, who brought them, how many they brought.
export function ProfileFacts({ profile }: { profile: Profile }) {
  const styles = useStyles();
  const facts = [
    { label: 'В Олеге с', value: joinedLabel(profile.joinedAt) },
    { label: 'Пригласил', value: profile.invitedBy ? profile.invitedBy.name : 'Основатель' },
    { label: 'Привёл', value: `${profile.invitedCount} ${plural(profile.invitedCount, 'абонента', 'абонентов', 'абонентов')}` },
  ];
  return (
    <View style={styles.facts}>
      {facts.map((f) => (
        <View key={f.label} style={styles.fact}>
          <Text style={styles.factLabel}>{f.label}</Text>
          <Text style={styles.factValue} numberOfLines={2}>
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Someone else's card: opens from a chat header.
export function UserCard({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const styles = useStyles();
  const skin = useSkin();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setProfile(null);
    setError(null);
    if (userId == null) return;
    api
      .user(userId)
      .then(({ user }) => setProfile(user))
      .catch((e) => setError(`${skin.copy.errorPrefix} ${(e as Error).message}`));
  }, [userId, skin]);

  return (
    <Modal visible={userId != null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Закрыть карточку">
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.sheetBody}>
            {profile ? (
              <>
                <Lollipop name={profile.name} size={104} avatar={profile.avatar} online={profile.online} />
                <Text style={styles.name}>{profile.name}</Text>
                <Text style={styles.nick}>@{profile.username}</Text>
                <Lcd size={12}>{statusLabel(profile)}</Lcd>
                {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
                <ProfileFacts profile={profile} />
              </>
            ) : (
              <Text style={styles.bioMuted}>{error ?? 'Ищем абонента в эфире…'}</Text>
            )}
            <Plastic colors={skin.roles.negative.grad} style={styles.close} onPress={onClose} accessibilityLabel="Закрыть">
              <Text style={[styles.closeText, { color: skin.roles.negative.text }]}>Закрыть</Text>
            </Plastic>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  facts: { flexDirection: 'row', alignSelf: 'stretch', gap: 8 },
  fact: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    gap: 3,
    ...frames.field,
  },
  factLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.text3, textAlign: 'center' },
  factValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, textAlign: 'center' },
  scrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '90%',
    borderRadius: 24,
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
    ...frames.card,
  },
  sheetBody: { padding: 22, gap: 12, alignItems: 'center' },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, textAlign: 'center' },
  nick: { fontFamily: fonts.mono, fontSize: 13, color: colors.text3, marginTop: -8 },
  bio: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink, textAlign: 'center' },
  bioMuted: { fontFamily: fonts.body, fontSize: 15, color: colors.text3, textAlign: 'center', paddingVertical: 30 },
  close: { height: 46, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  closeText: { fontFamily: fonts.bodyHeavy, fontSize: 16 },
}));
