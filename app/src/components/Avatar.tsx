import { StyleSheet, Text, View } from 'react-native';
import { avatarColor, useTheme } from '../theme';

export function Avatar({ name, size = 44, online }: { name: string; size?: number; online?: boolean }) {
  const theme = useTheme();
  const dot = Math.round(size * 0.28);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(name) },
        ]}
      >
        <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      {online ? (
        <View
          style={[
            styles.dot,
            { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: theme.online, borderColor: theme.bg },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  letter: { color: '#fff', fontWeight: '600' },
  dot: { position: 'absolute', right: 0, bottom: 0, borderWidth: 2 },
});
