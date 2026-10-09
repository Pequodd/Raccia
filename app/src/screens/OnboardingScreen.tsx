import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { InviteCard } from '../components/initiation';
import { InstallSteps, usePush } from '../components/notify';
import { CameraButton, usePhotoUpload } from '../components/profile';
import { Lollipop, Plastic } from '../components/y2k';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import { SkinPicker } from './AccountScreens';

const logo = require('../../assets/logo.webp');

type Step = 'hello' | 'skin' | 'me' | 'push' | 'invite';
const STEPS: Step[] = ['hello', 'skin', 'me', 'push', 'invite'];

// First run after registration: five short screens, each one useful on its own.
// «Пропустить» is always there; finishing or skipping marks the account as onboarded.
export function OnboardingScreen() {
  const styles = useStyles();
  const skin = useSkin();
  const { roles } = skin;
  const insets = useSafeAreaInsets();
  const { me, setMe } = useMessenger();
  const [step, setStep] = useState<Step>('hello');
  const [finishing, setFinishing] = useState(false);
  const index = STEPS.indexOf(step);
  const last = index === STEPS.length - 1;

  // Profile step state lives here so «Дальше» can save it.
  const [name, setName] = useState(me.status === 'initiated' ? me.name : '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setFinishing(true);
    try {
      const { user } = await api.onboarded();
      setMe(user);
    } catch {
      // Not critical: show the messenger anyway; onboarding returns next time.
      setMe({ ...me, onboarded: true });
    }
  }

  async function next() {
    setError(null);
    if (step === 'me' && me.status === 'initiated') {
      const changed = name.trim() !== me.name || bio.trim() !== (me.bio ?? '');
      if (changed) {
        if (!name.trim()) return setError('Имя не может быть пустым');
        try {
          const { user } = await api.updateProfile({ name: name.trim(), bio: bio.trim() || null });
          setMe(user);
        } catch (e) {
          return setError(`${skin.copy.errorPrefix} ${(e as Error).message}`);
        }
      }
    }
    if (last) finish();
    else setStep(STEPS[index + 1]);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 10 }]}>
        <View style={styles.dots} accessibilityLabel={`Шаг ${index + 1} из ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.dot, i <= index && styles.dotOn]} />
          ))}
        </View>
        <Pressable onPress={finish} disabled={finishing} style={styles.skip} accessibilityRole="button">
          <Text style={styles.skipText}>Пропустить</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          {step === 'hello' ? <Hello /> : null}
          {step === 'skin' ? (
            <Section title="Выберите, как будет выглядеть Олег" text="Скин меняется сразу. Передумаете — он в настройках.">
              <SkinPicker />
            </Section>
          ) : null}
          {step === 'me' ? <MeStep name={name} bio={bio} onName={setName} onBio={setBio} /> : null}
          {step === 'push' ? <PushStep /> : null}
          {step === 'invite' ? <InviteStep /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.bottomRow}>
          {index > 0 ? (
            <Plastic colors={roles.negative.grad} style={styles.back} onPress={() => setStep(STEPS[index - 1])} accessibilityLabel="Назад">
              <Text style={[styles.backText, { color: roles.negative.text }]}>Назад</Text>
            </Plastic>
          ) : null}
          <Plastic colors={roles.cta.grad} style={styles.next} onPress={next} disabled={finishing} accessibilityLabel={last ? 'Начать общаться' : 'Дальше'}>
            <Text style={[styles.nextText, { color: roles.cta.text }]}>{last ? 'Начать общаться' : 'Дальше'}</Text>
          </Plastic>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Section({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {children}
    </View>
  );
}

function Hello() {
  const styles = useStyles();
  const { me } = useMessenger();
  const points = [
    { mark: '✉', text: 'Сюда попадают только по инвайту от своих.' },
    { mark: '✋', text: 'Новичка впускают голосованием: 5 минут, решает большинство.' },
    { mark: '☺', text: 'Без цензуры и блокировок. Сервер наш, рекламы нет.' },
  ];
  return (
    <Section title={me.isAdmin ? 'Вы основали Олега' : 'Добро пожаловать в Олега'}>
      <Image source={logo} style={styles.logo} contentFit="contain" accessibilityLabel="Олег" />
      <Text style={styles.text}>
        {me.isAdmin
          ? 'Вы первый абонент и супер-админ. Настроим всё за минуту, а потом позовёте своих.'
          : 'Ненациональный мессенджер для своих. Настроим всё за минуту.'}
      </Text>
      <View style={styles.points}>
        {points.map((p) => (
          <View key={p.text} style={styles.point}>
            <Text style={styles.pointMark}>{p.mark}</Text>
            <Text style={styles.pointText}>{p.text}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

function MeStep({ name, bio, onName, onBio }: { name: string; bio: string; onName: (v: string) => void; onBio: (v: string) => void }) {
  const styles = useStyles();
  const { colors } = useSkin();
  const { me } = useMessenger();
  const photo = usePhotoUpload();

  if (me.status !== 'initiated') {
    return (
      <Section
        title={`Пока вы ${me.name}`}
        text={
          me.status === 'candidate'
            ? 'Абоненты голосуют, впускать ли вас. Писать можно уже сейчас. Имя, фото и «о себе» откроются, как только голосование закончится в вашу пользу.'
            : 'Абоненты сказали «нет». Писать и звать друзей можно, а имя и фото останутся Олеговыми.'
        }
      >
        <Lollipop name={me.name} size={112} avatar={me.avatar} />
      </Section>
    );
  }

  return (
    <Section title="Покажитесь своим" text="Фото и имя видят все абоненты. Всё можно поменять в профиле.">
      <View style={styles.avatarWrap}>
        <Lollipop name={name || me.name} size={120} avatar={me.avatar} />
        <View style={styles.camera}>
          <CameraButton onPress={photo.upload} busy={photo.busy} size={42} />
        </View>
      </View>
      {photo.busy ? <Text style={styles.text}>Загружаем фото…</Text> : null}
      {photo.error ? <Text style={styles.error}>{photo.error}</Text> : null}
      <View style={styles.fields}>
        <Text style={styles.label}>Имя</Text>
        <TextInput style={styles.input} value={name} onChangeText={onName} maxLength={32} placeholder={me.username} placeholderTextColor={colors.placeholder} />
        <Text style={styles.label}>О себе</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={bio}
          onChangeText={onBio}
          maxLength={140}
          multiline
          placeholder="Пара слов для своих"
          placeholderTextColor={colors.placeholder}
        />
      </View>
    </Section>
  );
}

function PushStep() {
  const styles = useStyles();
  const { roles } = useSkin();
  const push = usePush();
  if (Platform.OS !== 'web') {
    return <Section title="Уведомления" text="В приложении для телефона уведомления появятся в следующей версии. Пока включите их в веб-версии." />;
  }
  return (
    <Section title="Не пропускайте сообщения" text="Олег пришлёт уведомление о новом сообщении и о новичке, которого пора впускать.">
      {push.state === 'install' ? (
        <>
          <Text style={styles.text}>На iPhone сначала поставьте Олега на экран «Домой» и откройте его оттуда — тогда уведомления заработают.</Text>
          <InstallSteps />
        </>
      ) : push.state === 'on' ? (
        <Text style={styles.ok}>Уведомления включены ✓</Text>
      ) : push.state === 'denied' ? (
        <Text style={styles.error}>Уведомления запрещены в настройках браузера. Разрешите их для этого сайта — и включите в настройках Олега.</Text>
      ) : push.state === 'unsupported' ? (
        <Text style={styles.text}>Этот браузер не умеет push-уведомления. Попробуйте Chrome, Safari или Firefox.</Text>
      ) : (
        <Plastic colors={roles.action.grad} style={styles.bigButton} onPress={push.turnOn} disabled={push.busy || push.state == null} accessibilityLabel="Включить уведомления">
          <Text style={[styles.nextText, { color: roles.action.text }]}>Включить уведомления</Text>
        </Plastic>
      )}
    </Section>
  );
}

function InviteStep() {
  const styles = useStyles();
  const { roles, copy } = useSkin();
  const [inviting, setInviting] = useState(false);
  return (
    <Section title="Позовите своих" text="Олег пустой, пока здесь нет ваших. Отправьте ссылку другу: он зайдёт как Олег#N, а абоненты решат, впускать ли.">
      {inviting ? (
        <View style={{ alignSelf: 'stretch' }}>
          <InviteCard onClose={() => setInviting(false)} />
        </View>
      ) : (
        <Plastic colors={roles.chipInvite.grad} style={styles.bigButton} onPress={() => setInviting(true)} accessibilityLabel={copy.invite}>
          <Text style={[styles.nextText, { color: roles.chipInvite.text }]}>{copy.invite}</Text>
        </Plastic>
      )}
    </Section>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 22, height: 6, borderRadius: 3, backgroundColor: colors.divider },
  dotOn: { backgroundColor: colors.focus },
  skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  skipText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accentText },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 16 },
  column: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 12 },
  section: { gap: 14, alignItems: 'center' },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink, textAlign: 'center' },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.text2, textAlign: 'center' },
  ok: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.accentText, textAlign: 'center' },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.dangerText, textAlign: 'center' },
  logo: { width: 120, height: 120, borderRadius: 22 },
  points: { alignSelf: 'stretch', gap: 8 },
  point: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    ...frames.card,
  },
  pointMark: { width: 26, fontSize: 20, textAlign: 'center', color: colors.labelText },
  pointText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  avatarWrap: { width: 120, height: 120 },
  camera: { position: 'absolute', right: -6, bottom: -4 },
  fields: { alignSelf: 'stretch', gap: 6 },
  label: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.labelText, paddingLeft: 6, marginTop: 4 },
  input: {
    height: 50,
    borderRadius: 25,
    paddingHorizontal: 18,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    fontFamily: fonts.field,
    fontSize: 17,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  textarea: { height: 84, borderRadius: 18, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  bigButton: { height: 52, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 22, paddingTop: 8 },
  bottomRow: { width: '100%', maxWidth: 440, alignSelf: 'center', flexDirection: 'row', gap: 10 },
  back: { height: 52, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: fonts.bodyHeavy, fontSize: 16 },
  next: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontFamily: fonts.display, fontSize: 18 },
}));
