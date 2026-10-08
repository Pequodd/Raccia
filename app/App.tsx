import { Exo2_800ExtraBold_Italic } from '@expo-google-fonts/exo-2';
import { Nunito_400Regular, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { PTMono_400Regular } from '@expo-google-fonts/pt-mono';
import { Image } from 'expo-image';
import { useFonts } from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ApiError, setAuthToken } from './src/api';
import { Chrome, ChromeButton, ChromeLogo, GridBackground, Icon, Lollipop, Plastic, stickers } from './src/components/y2k';
import { ProfileScreen, SettingsScreen } from './src/screens/AccountScreens';
import { AuthScreen } from './src/screens/AuthScreen';
import { ChatListScreen, SearchField, type NewChatMode } from './src/screens/ChatListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { NewChatScreen } from './src/screens/NewChatScreen';
import { tokenStorage } from './src/storage';
import { MessengerProvider, useMessenger } from './src/store';
import type { Me } from './src/types';
import { colors, diagonal, fonts, plastic } from './src/y2k';

type Session = { token: string; user: Me };

// Web: an invite link opens the app with ?invite=CODE.
function inviteFromUrl(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('invite');
}

function clearInviteFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location.search) return;
  window.history.replaceState(null, '', window.location.pathname);
}

// List and conversation side by side on tablets and desktop browsers.
const WIDE_BREAKPOINT = 768;

export default function App() {
  const [fontsLoaded] = useFonts({
    Exo2_800ExtraBold_Italic,
    Nunito_400Regular,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    PTMono_400Regular,
  });
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

  const onAuth = useCallback(async (token: string, user: Me) => {
    clearInviteFromUrl();
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
      <View style={styles.root}>
        <GridBackground />
        <StatusBar style="dark" />
        {booting || !fontsLoaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.bondiText} />
          </View>
        ) : session ? (
          <Messenger key={session.token} session={session} onLogout={onLogout} />
        ) : offline ? (
          <Offline onRetry={restore} onLogout={onLogout} />
        ) : (
          <AuthScreen onAuth={onAuth} initialInvite={inviteFromUrl()} />
        )}
      </View>
    </SafeAreaProvider>
  );
}

function Offline({ onRetry, onLogout }: { onRetry: () => void; onLogout: () => void }) {
  return (
    <View style={[styles.center, { gap: 14, padding: 24 }]}>
      <Image source={stickers.sleep} style={{ width: 200, height: 200 }} contentFit="contain" />
      <Text style={styles.offlineTitle}>Нет сигнала</Text>
      <Text style={styles.offlineText}>Ищем спутник… Сервер Олега не отвечает.</Text>
      <Plastic colors={plastic.bondi} style={styles.offlineButton} onPress={onRetry} accessibilityLabel="Повторить">
        <Text style={styles.offlineButtonText}>Повторить</Text>
      </Plastic>
      <ChromeButton label="Выход" onPress={onLogout} />
    </View>
  );
}

type Tab = 'chats' | 'profile' | 'settings';

function Messenger({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const [activeChatId, setActiveChat] = useState<number | null>(null);
  return (
    <MessengerProvider me={session.user} token={session.token} activeChatId={activeChatId} setActiveChat={setActiveChat}>
      <Shell onLogout={onLogout} />
    </MessengerProvider>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { me, activeChatId, setActiveChat } = useMessenger();
  const [tab, setTab] = useState<Tab>('chats');
  const [composing, setComposing] = useState<NewChatMode | null>(null);
  const [query, setQuery] = useState('');

  // Opening a chat from anywhere brings the conversation into view.
  useEffect(() => {
    if (activeChatId) setTab('chats');
  }, [activeChatId]);

  const list = composing ? (
    <NewChatScreen mode={composing} onClose={() => setComposing(null)} wide={wide} />
  ) : (
    <ChatListScreen wide={wide} query={query} onQuery={setQuery} onNewChat={setComposing} />
  );

  if (wide) {
    let main;
    if (tab === 'profile') main = <ProfileScreen wide />;
    else if (tab === 'settings') main = <SettingsScreen onLogout={onLogout} wide />;
    else if (activeChatId) main = <ChatScreen chatId={activeChatId} wide />;
    else
      main = (
        <View style={styles.center}>
          <Image source={stickers.q} style={{ width: 180, height: 180 }} contentFit="contain" />
          <Text style={styles.offlineText}>Выбери канал слева, чтобы выйти в эфир.</Text>
        </View>
      );
    return (
      <View style={styles.wideOuter}>
        <View style={styles.imac}>
          <LinearGradient colors={plastic.bondi} {...diagonal} style={[StyleSheet.absoluteFill, { borderRadius: 30 }]} />
          <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={styles.imacShine} />
          <View style={styles.screen}>
            <GridBackground />
            <Chrome style={styles.toolbar}>
              <Pressable onPress={() => setTab('chats')} accessibilityLabel="Сообщения">
                <ChromeLogo size={30} />
              </Pressable>
              <View style={styles.toolbarSearch}>
                <SearchField value={query} onChange={setQuery} />
              </View>
              <View style={styles.toolbarLinks}>
                <Lollipop name={me.name} size={30} avatar={me.avatar} />
                <Text style={styles.toolbarLink} onPress={() => setTab('profile')}>
                  Абонент {me.name}
                </Text>
                <Text style={styles.toolbarDot}>·</Text>
                <Text style={styles.toolbarLink} onPress={() => setTab('settings')}>
                  Настройки
                </Text>
                <Text style={styles.toolbarDot}>·</Text>
                <Text style={styles.toolbarLink} onPress={onLogout}>
                  Выход
                </Text>
              </View>
            </Chrome>
            <View style={styles.split}>
              <View style={styles.sidebar}>{list}</View>
              <View style={styles.main}>{main}</View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (tab === 'chats' && activeChatId) {
    return <ChatScreen chatId={activeChatId} wide={false} onBack={() => setActiveChat(null)} />;
  }

  let body;
  if (tab === 'profile') body = <ProfileScreen wide={false} />;
  else if (tab === 'settings') body = <SettingsScreen onLogout={onLogout} wide={false} />;
  else body = list;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{body}</View>
      {composing && tab === 'chats' ? null : <TabBar tab={tab} onTab={setTab} />}
    </View>
  );
}

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const items: { key: Tab; label: string; icon: 'chat' | 'person' | 'settings' }[] = [
    { key: 'chats', label: 'Сообщения', icon: 'chat' },
    { key: 'profile', label: 'Абонент', icon: 'person' },
    { key: 'settings', label: 'Настройки', icon: 'settings' },
  ];
  return (
    <Chrome style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map((it) => {
        const on = it.key === tab;
        return (
          <Pressable key={it.key} style={styles.tab} onPress={() => onTab(it.key)} accessibilityRole="tab" accessibilityLabel={it.label}>
            {on ? (
              <Plastic colors={plastic.bondi} style={styles.tabCapsule} radius={15}>
                <Icon name={it.icon} size={20} color={colors.white} />
              </Plastic>
            ) : (
              <View style={styles.tabCapsule}>
                <Icon name={it.icon} size={20} color={colors.text2} />
              </View>
            )}
            <Text style={[styles.tabLabel, on && { color: colors.bondiText }]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </Chrome>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#E6E8F2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  offlineTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.ink },
  offlineText: { fontFamily: fonts.body, fontSize: 15, color: colors.text2, textAlign: 'center' },
  offlineButton: { height: 48, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center' },
  offlineButtonText: { fontFamily: fonts.display, fontSize: 18, color: colors.white },
  wideOuter: { flex: 1, padding: 16 },
  imac: { flex: 1, borderRadius: 30, padding: 14, boxShadow: '0 18px 40px rgba(0,112,138,0.35)' },
  imacShine: { position: 'absolute', left: 0, right: 0, top: 0, height: 60, borderTopLeftRadius: 30, borderTopRightRadius: 30 },
  screen: { flex: 1, borderRadius: 18, overflow: 'hidden', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.25)' },
  toolbar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.chromeEdge,
    zIndex: 2,
  },
  toolbarSearch: { flex: 1, maxWidth: 440 },
  toolbarLinks: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  toolbarLink: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.ink },
  toolbarDot: { color: colors.text4 },
  split: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 370, backgroundColor: 'rgba(255,255,255,0.45)', borderRightWidth: 1, borderRightColor: 'rgba(140,150,160,0.5)' },
  main: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.chromeEdge,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabCapsule: { width: 38, height: 30, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { fontFamily: fonts.bodyHeavy, fontSize: 11, color: colors.text2 },
});
