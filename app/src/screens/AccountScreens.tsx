import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chrome, Lcd, Lollipop, Plastic } from '../components/y2k';
import type { User } from '../types';
import { colors, fonts, plastic } from '../y2k';

function Page({ title, wide, children }: { title: string; wide: boolean; children: ReactNode }) {
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

export function ProfileScreen({ me, connected, wide }: { me: User; connected: boolean; wide: boolean }) {
  return (
    <Page title="Абонент" wide={wide}>
      <View style={styles.card}>
        <Lollipop name={me.username} size={96} online={connected} />
        <Text style={styles.name}>{me.username}</Text>
        <Lcd size={13}>{connected ? 'НА СВЯЗИ' : 'ИЩЕМ СПУТНИК'}</Lcd>
        <Text style={styles.note}>Смена имени и аватара появится вместе с обрядом инициации.</Text>
      </View>
    </Page>
  );
}

export function SettingsScreen({ onLogout, wide }: { onLogout: () => void; wide: boolean }) {
  return (
    <Page title="Настройки" wide={wide}>
      <View style={styles.card}>
        <Text style={styles.row}>Уведомления — скоро, вместе с push.</Text>
        <Plastic colors={plastic.danger} style={styles.logout} onPress={onLogout} accessibilityLabel="Выход">
          <Text style={styles.logoutText}>Выход</Text>
        </Plastic>
      </View>
      <Text style={styles.footer}>ОЛЕГ v0.1 · СОВМЕСТИМО С ПРОБЛЕМОЙ 2000 ✓</Text>
    </Page>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.9)',
    boxShadow: '0 2px 6px rgba(27,21,48,0.08)',
  },
  name: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  note: { fontFamily: fonts.body, fontSize: 13, color: colors.text3, textAlign: 'center' },
  row: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text2, alignSelf: 'stretch' },
  logout: { height: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  logoutText: { fontFamily: fonts.display, fontSize: 18, color: colors.white },
  footer: { fontFamily: fonts.mono, fontSize: 11, color: colors.text4, textAlign: 'center' },
});
