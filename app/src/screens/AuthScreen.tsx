import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { useTheme } from '../theme';
import type { User } from '../types';

export function AuthScreen({ onAuth }: { onAuth: (token: string, user: User) => void }) {
  const theme = useTheme();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fn = mode === 'login' ? api.login : api.register;
      const { token, user } = await fn(username.trim(), password);
      onAuth(token, user);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const input = [styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: theme.bg }]}
    >
      <View style={styles.card}>
        <Text style={[styles.logo, { color: theme.accent }]}>Олег</Text>
        <Text style={[styles.caption, { color: theme.muted }]}>
          {mode === 'login' ? 'Войдите, чтобы продолжить' : 'Создайте аккаунт'}
        </Text>

        <TextInput
          style={input}
          placeholder="Имя пользователя"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
        />
        <TextInput
          style={input}
          placeholder="Пароль"
          placeholderTextColor={theme.muted}
          secureTextEntry
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
          returnKeyType="go"
        />

        {error ? <Text style={[styles.error, { color: theme.danger }]}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={busy || !username || !password}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent, opacity: busy || !username || !password ? 0.5 : pressed ? 0.85 : 1 },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={theme.accentText} />
          ) : (
            <Text style={[styles.buttonText, { color: theme.accentText }]}>
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === 'login' ? 'register' : 'login');
            setError(null);
          }}
          style={styles.switch}
        >
          <Text style={{ color: theme.accent }}>
            {mode === 'login' ? 'Нет аккаунта? Регистрация' : 'Уже есть аккаунт? Войти'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, alignSelf: 'center', gap: 12 },
  logo: { fontSize: 36, fontWeight: '700', textAlign: 'center' },
  caption: { textAlign: 'center', marginBottom: 12 },
  input: { height: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, borderWidth: StyleSheet.hairlineWidth },
  error: { textAlign: 'center' },
  button: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  switch: { alignItems: 'center', paddingVertical: 8 },
});
