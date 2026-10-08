import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, setAuthToken } from './src/api';
import { AuthScreen } from './src/screens/AuthScreen';
import { ChatListScreen } from './src/screens/ChatListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { tokenStorage } from './src/storage';
import { MessengerProvider } from './src/store';
import { useTheme } from './src/theme';
import type { User } from './src/types';

type Session = { token: string; user: User };

// Side-by-side list + conversation on tablets and desktop browsers.
const SPLIT_BREAKPOINT = 768;

export default function App() {
  const theme = useTheme();
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  const [offline, setOffline] = useState(false);

  const restore = useCallback(async () => {
    setBooting(true);
    setOffline(false);
    const token = await tokenStorage.get();
    if (token) {
      setAuthToken(token);
      try {
        const { user } = await api.me();
        setSession({ token, user });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          await tokenStorage.clear();
          setAuthToken(null);
        } else {
          setOffline(true);
        }
      }
    }
    setBooting(false);
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const onAuth = useCallback(async (token: string, user: User) => {
    await tokenStorage.set(token);
    setAuthToken(token);
    setSession({ token, user });
  }, []);

  const onLogout = useCallback(async () => {
    api.logout().catch(() => {});
    await tokenStorage.clear();
    setAuthToken(null);
    setSession(null);
    setOffline(false);
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right']}>
        <StatusBar style="auto" />
        {booting ? (
          <View style={styles.center}>
            <ActivityIndicator />
          </View>
        ) : session ? (
          <Messenger key={session.token} session={session} onLogout={onLogout} />
        ) : offline ? (
          <Offline onRetry={restore} onLogout={onLogout} />
        ) : (
          <AuthScreen onAuth={onAuth} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Offline({ onRetry, onLogout }: { onRetry: () => void; onLogout: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { gap: 14 }]}>
      <Text style={{ color: theme.muted }}>Нет связи с сервером</Text>
      <Text style={{ color: theme.accent, fontWeight: '600' }} onPress={onRetry}>
        Повторить
      </Text>
      <Text style={{ color: theme.muted }} onPress={onLogout}>
        Выйти
      </Text>
    </View>
  );
}

function Messenger({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const split = width >= SPLIT_BREAKPOINT;
  const [activeChatId, setActiveChat] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);

  const sidebar = composing ? (
    <NewChatScreen onClose={() => setComposing(false)} />
  ) : (
    <ChatListScreen onNewChat={() => setComposing(true)} onLogout={onLogout} />
  );

  return (
    <MessengerProvider
      me={session.user}
      token={session.token}
      activeChatId={activeChatId}
      setActiveChat={setActiveChat}
    >
      {split ? (
        <View style={styles.split}>
          <View style={[styles.sidebar, { borderRightColor: theme.border }]}>{sidebar}</View>
          <View style={styles.main}>
            {activeChatId ? (
              <ChatScreen chatId={activeChatId} />
            ) : (
              <View style={[styles.center, { backgroundColor: theme.surface }]}>
                <Text style={{ color: theme.muted }}>Выберите чат</Text>
              </View>
            )}
          </View>
        </View>
      ) : activeChatId ? (
        <ChatScreen chatId={activeChatId} onBack={() => setActiveChat(null)} />
      ) : (
        sidebar
      )}
    </MessengerProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  split: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 360, borderRightWidth: StyleSheet.hairlineWidth },
  main: { flex: 1 },
});
