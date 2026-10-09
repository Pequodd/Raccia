import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { Chrome, Lcd, Lollipop, Plastic, stickerImages } from '../components/y2k';
import { makeStyles, skins, useSkin, useSkinSwitcher } from '../skins';
import { diagonal } from '../y2k';
import { LinearGradient } from 'expo-linear-gradient';
import { useMessenger } from '../store';
import { InviteCard } from '../components/initiation';
import { NotificationSettings } from '../components/notify';
import { CameraButton, ProfileFacts, statusLabel, usePhotoUpload } from '../components/profile';

function Page({ title, wide, children }: { title: string; wide: boolean; children: ReactNode }) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <Chrome style={[styles.header, { paddingTop: wide ? 0 : insets.top }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
        </View>
      </Chrome>
      <ScrollView contentContainerStyle={[styles.body, wide && styles.bodyWide]}>{children}</ScrollView>
    </View>
  );
}

export function ProfileScreen({ wide }: { wide: boolean }) {
  const skin = useSkin();
  const { colors, roles } = skin;
  const styles = useStyles();
  const { me, setMe, connected } = useMessenger();
  const initiated = me.status === 'initiated';
  const [name, setName] = useState(me.name);
  const [bio, setBio] = useState(me.bio ?? '');
  const [avatar, setAvatar] = useState<string | null>(me.avatar);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [inviting, setInviting] = useState(false);
  const photo = usePhotoUpload();
  const dirty = name.trim() !== me.name || bio.trim() !== (me.bio ?? '') || avatar !== me.avatar;

  // Initiation, an upload or a save elsewhere changes the profile under us.
  useEffect(() => {
    setName(me.name);
    setBio(me.bio ?? '');
    setAvatar(me.avatar);
  }, [me.name, me.bio, me.avatar]);

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const { user } = await api.updateProfile({ name: name.trim(), avatar, bio: bio.trim() || null });
      setMe(user);
      setNotice({ ok: true, text: 'Сохранено ✓' });
    } catch (e) {
      setNotice({ ok: false, text: `${skin.copy.errorPrefix} ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto() {
    setNotice(null);
    if (await photo.upload()) setNotice({ ok: true, text: 'Фото на месте ✓' });
  }

  const shownName = initiated ? name || me.name : me.name;
  const shownAvatar = initiated ? avatar : me.avatar;

  return (
    <Page title={skin.copy.profile} wide={wide}>
      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          <Lollipop name={shownName} size={112} online={connected} avatar={shownAvatar} />
          {initiated ? (
            <View style={styles.camera}>
              <CameraButton onPress={uploadPhoto} busy={photo.busy} />
            </View>
          ) : null}
        </View>
        <Text style={styles.name}>{shownName}</Text>
        <Text style={styles.nick}>@{me.username}</Text>
        <Lcd size={12}>{statusLabel(me)}</Lcd>
        {me.bio ? <Text style={styles.bio}>{me.bio}</Text> : null}
        {photo.busy ? <Text style={styles.note}>Загружаем фото…</Text> : null}
        {photo.error ? <Text style={[styles.notice, { color: colors.dangerText }]}>{photo.error}</Text> : null}
        {me.status === 'candidate' ? (
          <Text style={styles.note}>Имя, фото и «о себе» откроются, когда абоненты впустят тебя.</Text>
        ) : me.status === 'rejected' ? (
          <Text style={styles.note}>Абоненты сказали «нет». Ты навсегда {me.name}: писать и приглашать можно, менять имя и голосовать — нет.</Text>
        ) : null}
        <ProfileFacts profile={me} />
      </View>

      {initiated ? (
        <View style={[styles.card, { alignItems: 'stretch' }]}>
          <Text style={styles.label}>ИМЯ</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={32} placeholder={me.username} placeholderTextColor={colors.placeholder} />
          <View style={styles.labelRow}>
            <Text style={styles.label}>О СЕБЕ</Text>
            <Text style={styles.counter}>{bio.length}/140</Text>
          </View>
          <TextInput
            style={[styles.input, styles.textarea]}
            value={bio}
            onChangeText={setBio}
            maxLength={140}
            multiline
            placeholder="Пара слов для своих: чем живёшь, где тебя искать"
            placeholderTextColor={colors.placeholder}
          />
          <Text style={styles.label}>АВАТАР</Text>
          <View style={styles.avatars}>
            {me.photo ? (
              <Pressable onPress={() => setAvatar(me.photo)} style={[styles.avatarCell, avatar === me.photo && styles.avatarOn]} accessibilityLabel="Моё фото">
                <Lollipop name={shownName} size={52} avatar={me.photo} />
              </Pressable>
            ) : (
              <Pressable onPress={uploadPhoto} style={[styles.avatarCell, styles.uploadCell]} accessibilityLabel="Загрузить фото">
                <Text style={styles.uploadPlus}>+</Text>
                <Text style={styles.uploadText}>Фото</Text>
              </Pressable>
            )}
            <Pressable onPress={() => setAvatar(null)} style={[styles.avatarCell, avatar === null && styles.avatarOn]} accessibilityLabel="Без аватара">
              <Lollipop name={shownName} size={52} />
            </Pressable>
            {Object.keys(stickerImages).map((key) => (
              <Pressable key={key} onPress={() => setAvatar(key)} style={[styles.avatarCell, avatar === key && styles.avatarOn]} accessibilityLabel={`Стикер ${key}`}>
                <Lollipop name={shownName} size={52} avatar={key} />
              </Pressable>
            ))}
          </View>
          {notice ? <Text style={[styles.notice, !notice.ok && { color: colors.dangerText }]}>{notice.text}</Text> : null}
          <Plastic colors={roles.action.grad} style={styles.save} onPress={save} disabled={busy || !dirty || !name.trim()} accessibilityLabel="Сохранить профиль">
            <Text style={[styles.logoutText, { color: roles.action.text }]}>Сохранить</Text>
          </Plastic>
        </View>
      ) : null}

      {inviting ? (
        <InviteCard onClose={() => setInviting(false)} />
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Позвать своих</Text>
          <Text style={styles.note}>Одноразовая ссылка. Новичок войдёт как Олег#N, и абоненты 5 минут решают, впустить ли его.</Text>
          <Plastic colors={roles.chipInvite.grad} style={styles.save} onPress={() => setInviting(true)} accessibilityLabel={skin.copy.invite}>
            <Text style={[styles.logoutText, { color: roles.chipInvite.text }]}>{skin.copy.invite}</Text>
          </Plastic>
        </View>
      )}
    </Page>
  );
}

// The skin grid: tap to switch at once (Settings and onboarding).
export function SkinPicker() {
  const skin = useSkin();
  const styles = useStyles();
  const { setSkin } = useSkinSwitcher();
  return (
    <View style={styles.skins}>
      {skins.map((s) => {
        const on = s.id === skin.id;
        return (
          <Pressable
            key={s.id}
            onPress={() => setSkin(s.id)}
            style={[styles.skinCell, on && styles.skinOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Скин ${s.name}`}
          >
            <View style={styles.skinPreview}>
              <LinearGradient colors={s.background.gradient} style={StyleSheet.absoluteFill} />
              <LinearGradient colors={s.bubbles.theirs.grad} {...diagonal} style={[styles.skinBubble, { left: 8, top: 10 }]} />
              <LinearGradient colors={s.bubbles.mine.grad} {...diagonal} style={[styles.skinBubble, { right: 8, top: 34 }]} />
            </View>
            <Text style={styles.skinName}>
              {on ? '✓ ' : ''}
              {s.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsScreen({ onLogout, wide }: { onLogout: () => void; wide: boolean }) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  return (
    <Page title={skin.copy.settings} wide={wide}>
      <View style={[styles.card, { alignItems: 'stretch' }]}>
        <Text style={styles.label}>СКИН</Text>
        <SkinPicker />
      </View>
      <View style={styles.card}>
        <NotificationSettings />
      </View>
      <View style={styles.card}>
        <Plastic colors={roles.danger.grad} style={styles.logout} onPress={onLogout} accessibilityLabel={skin.copy.logout}>
          <Text style={[styles.logoutText, { color: roles.danger.text }]}>{skin.copy.logout}</Text>
        </Plastic>
      </View>
      <Text style={styles.footer}>ОЛЕГ v0.1 · {skin.copy.footer}</Text>
      <Text style={styles.footer}>
        {skin.copy.promise.replace('\n', ' ')}
        {'\n'}
        {skin.copy.promiseProof}
      </Text>
    </Page>
  );
}

const useStyles = makeStyles(({ colors, fonts, roles, frames, bubbles }) => ({
  root: { flex: 1 },
  header: { borderBottomWidth: 1, borderBottomColor: colors.chromeEdge, boxShadow: '0 2px 6px rgba(27,21,48,0.15)', zIndex: 2 },
  headerRow: { height: 56, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  body: { padding: 16, gap: 16 },
  bodyWide: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  card: {
    borderRadius: 20,
    padding: 20,
    gap: 12,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    boxShadow: '0 2px 6px rgba(27,21,48,0.08)',
    ...frames.card,
  },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, textAlign: 'center' },
  nick: { fontFamily: fonts.mono, fontSize: 13, color: colors.text3, marginTop: -8 },
  avatarWrap: { width: 112, height: 112 },
  camera: { position: 'absolute', right: -6, bottom: -4 },
  bio: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink, textAlign: 'center' },
  cardTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  counter: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4 },
  textarea: { height: 84, borderRadius: 18, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.body, fontSize: 16, textAlignVertical: 'top' },
  uploadCell: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderColor: colors.fieldBorder },
  uploadPlus: { fontFamily: fonts.display, fontSize: 22, color: colors.accentText, lineHeight: 24 },
  uploadText: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.accentText },
  label: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1.5, color: colors.labelText, paddingLeft: 4 },
  input: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 18,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  avatars: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  avatarCell: { padding: 3, borderRadius: 32, borderWidth: 2, borderColor: 'transparent' },
  avatarOn: { borderColor: colors.focus, boxShadow: '0 0 0 3px rgba(0,170,205,0.2)' },
  notice: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accentText, textAlign: 'center' },
  skins: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  skinCell: { width: 132, padding: 6, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', gap: 6 },
  skinOn: { borderColor: colors.focus },
  skinPreview: { height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.divider },
  skinBubble: { position: 'absolute', width: 64, height: 18, borderRadius: 9 },
  skinName: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.ink, textAlign: 'center' },
  save: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.text3, textAlign: 'center' },
  row: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text2, alignSelf: 'stretch' },
  logout: { height: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontFamily: fonts.display, fontSize: 18, color: roles.action.text },
  footer: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4, textAlign: 'center' },
}));
