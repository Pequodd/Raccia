import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
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
import { ChromeLogo, Plastic, stickers } from '../components/y2k';
import { colors, diagonal, fonts, plastic } from '../y2k';
import type { User } from '../types';

type Problem = { kind: 'auth' | 'offline' | 'other'; text: string };

export function AuthScreen({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [focus, setFocus] = useState<'nick' | 'pass' | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || !username || !password) return;
    setBusy(true);
    setProblem(null);
    try {
      const fn = mode === 'login' ? api.login : api.register;
      const { token, user } = await fn(username.trim(), password);
      onAuth(token, user);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 0) setProblem({ kind: 'offline', text: 'Нет сигнала. Ищем спутник…' });
      else if (err.status === 401)
        setProblem({ kind: 'auth', text: 'Ошибка Y2K! Компьютер думает, что сейчас 1900 год. Проверьте ник и пароль.' });
      else setProblem({ kind: 'other', text: `Ошибка Y2K! ${err.message}` });
      setBusy(false);
    }
  }

  const fieldStyle = (name: 'nick' | 'pass') => [
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
          <View style={styles.ball}>
            <LinearGradient colors={['rgba(0,190,225,0.75)', 'rgba(0,112,138,0.92)']} {...diagonal} style={StyleSheet.absoluteFill} />
            <Image source={stickers.idea} style={styles.ballOleg} contentFit="contain" />
            <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={styles.ballShine} pointerEvents="none" />
            <View style={styles.ballShade} pointerEvents="none" />
          </View>

          <View style={styles.logo}>
            <ChromeLogo size={58} />
          </View>
          <Text style={styles.slogan}>НеМногонациональный мессенджер Олег</Text>

          <View style={styles.fields}>
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
            colors={plastic.tangerine}
            style={styles.button}
            shadow="0 6px 14px rgba(255,122,0,0.35)"
            onPress={submit}
            disabled={busy || !username || !password}
            accessibilityLabel={mode === 'login' ? 'Погнали в 2000!' : 'Подключиться'}
          >
            {busy ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.buttonText}>{mode === 'login' ? 'Погнали в 2000!' : 'Подключиться'}</Text>
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

          <Text style={styles.footer}>СОВМЕСТИМО С ПРОБЛЕМОЙ 2000 ✓</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  slogan: { fontFamily: fonts.body, fontSize: 15, color: colors.text2, textAlign: 'center', marginTop: 2 },
  fields: { gap: 12, marginTop: 22 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.grapeText,
    paddingLeft: 16,
    marginBottom: 5,
  },
  input: {
    height: 52,
    borderRadius: 26,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(123,75,200,0.35)',
    boxShadow: 'inset 0 2px 4px rgba(27,21,48,0.12)',
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: colors.ink,
    outlineWidth: 0,
  },
  inputFocus: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 2,
    borderColor: colors.focus,
    boxShadow: 'inset 0 2px 4px rgba(27,21,48,0.12), 0 0 0 4px rgba(0,170,205,0.2)',
  },
  inputError: { borderColor: colors.pink },
  problem: {
    marginTop: 16,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,43,214,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,0,174,0.3)',
  },
  problemOffline: { backgroundColor: 'rgba(255,255,255,0.6)', borderColor: colors.chromeEdge },
  problemText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#8A0070', textAlign: 'center' },
  button: { height: 56, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  buttonText: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.white,
    textShadowColor: 'rgba(130,50,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  switch: { paddingVertical: 14 },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.text2, textAlign: 'center' },
  link: { fontFamily: fonts.bodyHeavy, color: colors.bondiText },
  footer: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4, textAlign: 'center', marginTop: 24 },
});
