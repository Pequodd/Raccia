import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { setPrefs, usePrefs } from '../prefs';
import { chirp, disablePush, enablePush, isIOS, isStandalone, pushState, type PushState } from '../push';
import { makeStyles, useSkin } from '../skins';
import { useMessenger } from '../store';
import { Lollipop, Plastic } from './y2k';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

// --- Installing as an app ---------------------------------------------------------

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferredPrompt: InstallPrompt | null = null;
const promptListeners = new Set<() => void>();
if (web) {
  // Chrome / Android: the browser offers installation; keep the offer for our own button.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as InstallPrompt;
    for (const l of promptListeners) l();
  });
}

export function useInstall() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    promptListeners.add(l);
    return () => {
      promptListeners.delete(l);
    };
  }, []);
  const installed = !web || isStandalone();
  return {
    installed,
    iosSteps: web && !installed && isIOS(), // iPhone/iPad: only by hand, via «Поделиться»
    canPrompt: !installed && deferredPrompt != null,
    prompt: async () => {
      const p = deferredPrompt;
      if (!p) return;
      deferredPrompt = null;
      await p.prompt();
      rerender((n) => n + 1);
    },
  };
}

const HINT_AGAIN_MS = 3 * 24 * 3600_000;

// Opened on an iPhone in Safari (or a browser that can install): show at once how to
// put Oleg on the home screen. Push on iPhone works only there.
export function InstallSheet() {
  const styles = useStyles();
  const skin = useSkin();
  const [prefs, loaded] = usePrefs();
  const install = useInstall();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!loaded || install.installed) return;
    if (!install.iosSteps && !install.canPrompt) return;
    if (Date.now() - prefs.installHintAt < HINT_AGAIN_MS) return;
    setOpen(true);
  }, [loaded, install.installed, install.iosSteps, install.canPrompt, prefs.installHintAt]);

  const close = () => {
    setOpen(false);
    setPrefs({ installHintAt: Date.now() });
  };

  if (!open) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.installScrim} onPress={close} accessibilityLabel="Закрыть подсказку" />
      <View style={[styles.installSheet, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.grabber} />
        <Text style={styles.installTitle}>Поставьте Олега на экран «Домой»</Text>
        <Text style={styles.installText}>
          Так он откроется как обычное приложение: на весь экран, со своей иконкой и с уведомлениями о новых сообщениях.
        </Text>
        {install.iosSteps ? (
          <InstallSteps />
        ) : (
          <Plastic colors={skin.roles.cta.grad} style={styles.installButton} onPress={() => install.prompt().then(close)} accessibilityLabel="Установить">
            <Text style={[styles.installButtonText, { color: skin.roles.cta.text }]}>Установить</Text>
          </Plastic>
        )}
        <Pressable onPress={close} style={styles.later} accessibilityRole="button">
          <Text style={styles.laterText}>Позже</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function ShareGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

function AddGlyph({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Rect x={4} y={4} width={16} height={16} rx={4} stroke={color} strokeWidth={2} fill="none" />
      <Path d="M12 8.5v7M8.5 12h7" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

// The three taps in Safari, with the same icons the person will see on screen.
export function InstallSteps() {
  const styles = useStyles();
  const { colors } = useSkin();
  const steps = [
    { icon: <ShareGlyph color={colors.accentText} />, text: 'Нажмите «Поделиться» внизу экрана Safari (в Chrome — вверху справа).' },
    { icon: <AddGlyph color={colors.accentText} />, text: 'Прокрутите список и выберите «На экран „Домой“».' },
    { icon: <Text style={styles.stepOk}>Добавить</Text>, text: 'Нажмите «Добавить» и откройте Олега с иконки на экране.' },
  ];
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <View style={styles.stepIcon}>{s.icon}</View>
          <Text style={styles.stepText}>{s.text}</Text>
        </View>
      ))}
    </View>
  );
}

// --- Notification settings --------------------------------------------------------

const PUSH_TEXT: Record<PushState, string> = {
  on: 'Включены на этом устройстве. Придут, даже когда Олег закрыт.',
  off: 'Выключены. Включите, чтобы не пропускать сообщения и голосования.',
  denied: 'Запрещены в настройках браузера или телефона. Разрешите уведомления для этого сайта и вернитесь сюда.',
  install: 'На iPhone уведомления работают, только когда Олег стоит на экране «Домой».',
  unsupported: 'Этот браузер не умеет push-уведомления. Попробуйте Chrome, Safari или Firefox.',
};

export function usePush() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);
  const turnOn = useCallback(async () => {
    setBusy(true);
    try {
      setState(await enablePush());
    } catch {
      setState(await pushState().catch(() => 'unsupported' as const));
    } finally {
      setBusy(false);
    }
  }, []);
  const turnOff = useCallback(async () => {
    setBusy(true);
    await disablePush().catch(() => {});
    setState(await pushState().catch(() => 'unsupported' as const));
    setBusy(false);
  }, []);
  return { state, busy, turnOn, turnOff };
}

export function NotificationSettings() {
  const styles = useStyles();
  const skin = useSkin();
  const { colors, roles } = skin;
  const [prefs] = usePrefs();
  const push = usePush();
  const install = useInstall();

  return (
    <View style={styles.settings}>
      <View style={styles.settingRow}>
        <View style={styles.settingTextCol}>
          <Text style={styles.settingTitle}>Push-уведомления</Text>
          <Text style={styles.settingHint}>{push.state ? PUSH_TEXT[push.state] : 'Проверяем…'}</Text>
        </View>
        {push.state === 'on' || push.state === 'off' ? (
          <Switch
            value={push.state === 'on'}
            disabled={push.busy}
            onValueChange={(v) => (v ? push.turnOn() : push.turnOff())}
            trackColor={{ true: colors.focus, false: colors.fieldBorder }}
            accessibilityLabel="Push-уведомления"
          />
        ) : null}
      </View>
      {push.state === 'install' ? <InstallSteps /> : null}
      {push.state !== 'install' && install.canPrompt ? (
        <Plastic colors={roles.action.grad} style={styles.inlineButton} onPress={install.prompt} accessibilityLabel="Установить как приложение">
          <Text style={[styles.inlineButtonText, { color: roles.action.text }]}>Установить как приложение</Text>
        </Plastic>
      ) : null}
      <View style={styles.divider} />
      <View style={styles.settingRow}>
        <View style={styles.settingTextCol}>
          <Text style={styles.settingTitle}>Баннер в приложении</Text>
          <Text style={styles.settingHint}>Сверху, когда пишут в другой чат, пока Олег открыт.</Text>
        </View>
        <Switch
          value={prefs.banners}
          onValueChange={(v) => setPrefs({ banners: v })}
          trackColor={{ true: colors.focus, false: colors.fieldBorder }}
          accessibilityLabel="Баннер в приложении"
        />
      </View>
      <View style={styles.settingRow}>
        <View style={styles.settingTextCol}>
          <Text style={styles.settingTitle}>Звук</Text>
          <Text style={styles.settingHint}>Короткий писк модема вместе с баннером.</Text>
        </View>
        <Switch
          value={prefs.sound}
          onValueChange={(v) => {
            setPrefs({ sound: v });
            if (v) chirp();
          }}
          trackColor={{ true: colors.focus, false: colors.fieldBorder }}
          accessibilityLabel="Звук уведомлений"
        />
      </View>
    </View>
  );
}

// --- In-app banner ------------------------------------------------------------------

const BANNER_MS = 4500;

// A message in another chat while Oleg is open: a banner slides in from the top.
export function InAppBanner() {
  const styles = useStyles();
  const { incoming, dismissIncoming, setActiveChat, activeChatId } = useMessenger();
  const [prefs] = usePrefs();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(-140)).current;
  const shown = incoming && prefs.banners && incoming.message.chatId !== activeChatId ? incoming : null;

  useEffect(() => {
    if (!shown) return;
    if (prefs.sound) chirp();
    Animated.spring(y, { toValue: 0, useNativeDriver: Platform.OS !== 'web', speed: 18, bounciness: 6 }).start();
    const timer = setTimeout(() => {
      Animated.timing(y, { toValue: -140, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(() => dismissIncoming());
    }, BANNER_MS);
    return () => clearTimeout(timer);
    // A new message restarts the banner (key changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.key]);

  if (!shown) return null;
  const { message, title } = shown;
  const group = title !== message.name;
  return (
    <Animated.View style={[styles.bannerWrap, { top: insets.top + 8, transform: [{ translateY: y }] }]} pointerEvents="box-none">
      <Pressable
        style={styles.banner}
        onPress={() => {
          setActiveChat(message.chatId);
          dismissIncoming();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Новое сообщение от ${message.name}. Открыть чат`}
      >
        <Lollipop name={title} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.bannerTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.bannerBody} numberOfLines={2}>
            {group ? `${message.name}: ` : ''}
            {message.body}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles(({ colors, fonts, frames }) => ({
  installScrim: { flex: 1, backgroundColor: 'rgba(10,8,20,0.5)' },
  installSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 22,
    paddingTop: 10,
    gap: 12,
    backgroundColor: colors.screen,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    boxShadow: '0 -10px 40px rgba(0,0,0,0.35)',
    ...frames.card,
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.divider, marginBottom: 4 },
  installTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  installText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.text2 },
  installButton: { height: 50, alignItems: 'center', justifyContent: 'center' },
  installButtonText: { fontFamily: fonts.display, fontSize: 18 },
  later: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
  laterText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.accentText },
  steps: { gap: 8, alignSelf: 'stretch' },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorderSoft,
    ...frames.field,
  },
  stepNum: { width: 18, fontFamily: fonts.display, fontSize: 18, color: colors.labelText, textAlign: 'center' },
  stepIcon: { minWidth: 32, alignItems: 'center' },
  stepOk: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.accentText },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.ink },
  settings: { alignSelf: 'stretch', gap: 12 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingTextCol: { flex: 1, gap: 2 },
  settingTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  settingHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.text3 },
  divider: { height: 1, backgroundColor: colors.divider },
  inlineButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  inlineButtonText: { fontFamily: fonts.bodyHeavy, fontSize: 15 },
  bannerWrap: { position: 'absolute', left: 10, right: 10, zIndex: 50, alignItems: 'center' },
  banner: {
    width: '100%',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 20,
    backgroundColor: colors.screen,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
    ...frames.card,
  },
  bannerTitle: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.ink },
  bannerBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.text2 },
}));
