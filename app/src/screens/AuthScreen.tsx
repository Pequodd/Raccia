import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError } from '../api';
import { parseInvite } from '../config';
import { PlayerHero } from '../components/heroes';
import { ChromeLogo, Plastic, stickers } from '../components/y2k';
import { makeStyles, useSkin } from '../skins';
import { diagonal } from '../y2k';
import type { Me } from '../types';

type Problem = { kind: 'auth' | 'offline' | 'other'; text: string };

export function AuthScreen({
  onAuth,
  initialInvite,
}: {
  onAuth: (token: string, user: Me) => void;
  initialInvite?: string | null;
}) {
  const skin = useSkin();
  const { colors, roles, fonts, chrome } = skin;
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>(initialInvite ? 'register' : 'login');
  const [invite, setInvite] = useState(initialInvite ?? '');
  const [inviter, setInviter] = useState<{ ok: boolean; text: string } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [focus, setFocus] = useState<'nick' | 'pass' | 'invite' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  // Show who sent the invite as soon as a code is there.
  useEffect(() => {
    const code = parseInvite(invite);
    if (mode !== 'register' || !code) {
      setInviter(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .invite(code)
        .then((r) => !cancelled && setInviter({ ok: true, text: `Тебя пригласил ${r.invitedBy}` }))
        .catch((e: ApiError) =>
          !cancelled && setInviter({ ok: false, text: e.status === 0 ? skin.copy.noSignal : 'Инвайт недействителен или уже использован' })
        );
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invite, mode]);

  async function submit() {
    if (busy || !username || !password) return;
    setBusy(true);
    setProblem(null);
    try {
      const { token, user } =
        mode === 'login'
          ? await api.login(username.trim(), password)
          : await api.register(username.trim(), password, parseInvite(invite) || undefined);
      onAuth(token, user);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 0) setProblem({ kind: 'offline', text: skin.copy.noSignal });
      else if (err.status === 401)
        setProblem({ kind: 'auth', text: skin.copy.loginError });
      else setProblem({ kind: 'other', text: `${skin.copy.errorPrefix} ${err.message}` });
      setBusy(false);
    }
  }

  const fieldStyle = (name: 'nick' | 'pass' | 'invite') => [
    styles.input,
    focus === name && styles.inputFocus,
    problem?.kind === 'auth' && styles.inputError,
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 30 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.column}>
          {skin.hero === 'player' ? (
            <PlayerHero />
          ) : (
            <>
              <View style={styles.ball}>
                <LinearGradient colors={skin.ball} {...diagonal} style={StyleSheet.absoluteFill} />
                <Image source={stickers.idea} style={styles.ballOleg} contentFit="contain" />
                <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={styles.ballShine} pointerEvents="none" />
                <View style={styles.ballShade} pointerEvents="none" />
              </View>
              <View style={styles.logo}>
                <ChromeLogo size={58} />
              </View>
            </>
          )}
          <Text style={styles.slogan}>{skin.copy.slogan}</Text>
          <Plastic colors={roles.promo.grad} radius={18} style={styles.promo} shadow="0 6px 16px rgba(124,194,30,0.45)">
            <Text style={styles.promoTitle}>{skin.copy.promise}</Text>
            <Text style={styles.promoProof}>{skin.copy.promiseProof}</Text>
          </Plastic>

          <View style={styles.fields}>
            {mode === 'register' ? (
              <View>
                <Text style={styles.label}>ИНВАЙТ</Text>
                <TextInput
                  style={fieldStyle('invite')}
                  value={invite}
                  onChangeText={setInvite}
                  onFocus={() => setFocus('invite')}
                  onBlur={() => setFocus(null)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="код или ссылка"
                  placeholderTextColor={colors.placeholder}
                />
                {inviter ? (
                  <Text style={[styles.inviter, !inviter.ok && { color: colors.dangerText }]}>{inviter.text}</Text>
                ) : null}
              </View>
            ) : null}
            <View>
              <Text style={styles.label}>НИК</Text>
              <TextInput
                style={fieldStyle('nick')}
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocus('nick')}
                onBlur={() => setFocus(null)}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                returnKeyType="next"
                placeholder="ivan_petrovich"
                placeholderTextColor={colors.placeholder}
              />
            </View>
            <View>
              <Text style={styles.label}>ПАРОЛЬ</Text>
              <TextInput
                style={fieldStyle('pass')}
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocus('pass')}
                onBlur={() => setFocus(null)}
                secureTextEntry
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>
          </View>

          {problem ? (
            <View style={[styles.problem, problem.kind === 'offline' && styles.problemOffline]}>
              <Text style={[styles.problemText, problem.kind === 'offline' && { color: colors.text2 }]}>{problem.text}</Text>
            </View>
          ) : null}

          <Plastic
            colors={roles.cta.grad}
            style={styles.button}
            shadow="0 6px 14px rgba(255,122,0,0.35)"
            onPress={submit}
            disabled={busy || !username || !password}
            accessibilityLabel={mode === 'login' ? skin.copy.loginButton : skin.copy.registerButton}
          >
            {busy ? (
              <ActivityIndicator color={roles.cta.text} />
            ) : (
              <Text style={styles.buttonText}>{mode === 'login' ? skin.copy.loginButton : skin.copy.registerButton}</Text>
            )}
          </Plastic>

          <Pressable
            onPress={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setProblem(null);
            }}
            style={styles.switch}
          >
            <Text style={styles.hint}>
              {mode === 'login' ? (
                <>
                  Нет доступа? Попроси инвайт у любого абонента.{' '}
                  <Text style={styles.link}>Уже есть инвайт?</Text>
                </>
              ) : (
                <>
                  Уже подключён? <Text style={styles.link}>Войти</Text>
                </>
              )}
            </Text>
          </Pressable>

          <Text style={styles.footer}>{skin.copy.footer}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors, fonts, roles, frames, shape }) => ({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 26, justifyContent: 'center' },
  column: { width: '100%', maxWidth: 360, alignSelf: 'center', alignItems: 'stretch' },
  ball: {
    width: 236,
    height: 236,
    borderRadius: 118,
    overflow: 'hidden',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    boxShadow: '0 14px 30px rgba(0,112,138,0.35)',
  },
  ballOleg: { position: 'absolute', width: 300, height: 300, left: -32, top: 22 },
  ballShine: { position: 'absolute', left: 40, right: 40, top: 6, height: 90, borderRadius: 60 },
  ballShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 118,
    boxShadow: 'inset 0 3px 0 rgba(255,255,255,0.6), inset 0 -14px 26px rgba(0,50,70,0.4)',
  },
  logo: { alignItems: 'center', marginTop: 10 },
  slogan: { fontFamily: fonts.body, fontSize: 15, color: colors.text2, textAlign: 'center', marginTop: 8 },
  fields: { gap: 12, marginTop: 22 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.labelText,
    paddingLeft: 16,
    marginBottom: 5,
  },
  input: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    backgroundColor: colors.field,
    borderWidth: 1,
    borderColor: colors.fieldBorder,
    boxShadow: 'inset 0 2px 4px rgba(27,21,48,0.12)',
    fontFamily: fonts.field,
    fontSize: 17,
    color: colors.fieldText,
    outlineWidth: 0,
    ...frames.field,
  },
  inputFocus: {
    backgroundColor: colors.fieldFocus,
    borderWidth: 2,
    borderColor: colors.focus,
    borderTopColor: colors.focus,
    borderLeftColor: colors.focus,
    borderRightColor: colors.focus,
    borderBottomColor: colors.focus,
    boxShadow: `inset 0 2px 4px rgba(27,21,48,0.12), 0 0 0 4px ${colors.focusGlow}`,
  },
  inputError: {
    borderColor: colors.dangerBorder,
    borderTopColor: colors.dangerBorder,
    borderLeftColor: colors.dangerBorder,
    borderRightColor: colors.dangerBorder,
    borderBottomColor: colors.dangerBorder,
  },
  problem: {
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  problemOffline: { backgroundColor: colors.surface, borderColor: colors.chromeEdge },
  problemText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.dangerText, textAlign: 'center' },
  button: { height: 56, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: roles.cta.text,
    textShadowColor: shape.kind === 'glossy' ? 'rgba(130,50,0,0.7)' : 'transparent',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  switch: { paddingVertical: 14 },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.text2, textAlign: 'center' },
  link: { fontFamily: fonts.bodyHeavy, color: colors.accentText },
  inviter: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.labelText, paddingLeft: 16, marginTop: 5 },
  footer: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4, textAlign: 'center', marginTop: 24 },
  promo: {
    marginTop: 14,
    marginHorizontal: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    transform: [{ rotate: '-2.5deg' }],
  },
  promoTitle: { fontFamily: fonts.display, fontSize: 21, lineHeight: 25, color: roles.promo.text, textAlign: 'center' },
  promoProof: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: roles.promo.text, textAlign: 'center', marginTop: 4 },
}));
