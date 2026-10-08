import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Path, Pattern, Rect, Stop, Text as SvgText } from 'react-native-svg';
import {
  avatarGradient,
  avatarTextColor,
  chromeStops,
  colors,
  diagonal,
  fonts,
  initials,
} from '../y2k';

export const stickers = {
  idea: require('../../assets/stickers/webp/idea.webp'),
  sleep: require('../../assets/stickers/webp/sleep.webp'),
  q: require('../../assets/stickers/webp/q.webp'),
};

// «Cyberspace grid» behind every screen.
export function GridBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={['#F3F4FA', '#D9DCEA']} start={{ x: 0.37, y: 0 }} end={{ x: 0.63, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <Line x1="0" y1="0.5" x2="24" y2="0.5" stroke="rgba(123,75,200,0.07)" strokeWidth="1" />
            <Line x1="0.5" y1="0" x2="0.5" y2="24" stroke="rgba(123,75,200,0.07)" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#grid)" />
      </Svg>
    </View>
  );
}

// Glossy translucent plastic: gradient body, top highlight, inner shading.
export function Plastic({
  colors: grad,
  style,
  radius = 999,
  shadow,
  children,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  colors: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  radius?: number;
  shadow?: string;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const body = (pressed: boolean) => (
    <>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} pointerEvents="none">
        <LinearGradient colors={grad} {...diagonal} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
          style={styles.highlight}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: radius,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.55)',
              boxShadow: pressed
                ? 'inset 0 3px 6px rgba(0,0,0,0.25)'
                : 'inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -6px 10px rgba(0,0,0,0.18)',
            },
          ]}
        />
      </View>
      {children}
    </>
  );

  const base: StyleProp<ViewStyle> = [
    { borderRadius: radius, boxShadow: shadow ?? '0 3px 8px rgba(27,21,48,0.25)' },
    style,
  ];

  if (!onPress) return <View style={base}>{body(false)}</View>;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, { opacity: disabled ? 0.55 : 1 }, pressed && { transform: [{ scale: 0.96 }] }]}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

// Brushed chrome: header bars, tab bar, secondary buttons.
export function Chrome({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={style}>
      <LinearGradient colors={chromeStops.colors} locations={chromeStops.locations} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function ChromeButton({
  label,
  icon,
  size,
  onPress,
  style,
  disabled,
}: {
  label?: string;
  icon?: ReactNode;
  size?: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chromeButton,
        size ? { width: size, height: size, borderRadius: size / 2 } : { height: 38, borderRadius: 19, paddingHorizontal: 16 },
        { opacity: disabled ? 0.55 : 1 },
        pressed && { transform: [{ scale: 0.96 }] },
        style,
      ]}
    >
      <LinearGradient colors={chromeStops.colors} locations={chromeStops.locations} style={StyleSheet.absoluteFill} />
      {icon ?? <Text style={styles.chromeButtonText}>{label}</Text>}
    </Pressable>
  );
}

// «ОЛЕГ» in chrome letters with a hard drop shadow.
export function ChromeLogo({ size = 58, text = 'ОЛЕГ' }: { size?: number; text?: string }) {
  const width = Math.round(size * text.length * 0.78);
  const height = Math.round(size * 1.25);
  const baseline = Math.round(size * 0.95);
  return (
    <Svg width={width} height={height} accessibilityLabel={text}>
      <Defs>
        <SvgGradient id="chrome" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.4" stopColor="#C9D0D7" />
          <Stop offset="0.5" stopColor="#5E6870" />
          <Stop offset="0.62" stopColor="#AEB7BF" />
          <Stop offset="1" stopColor="#F2F4F6" />
        </SvgGradient>
      </Defs>
      <SvgText x={width / 2} y={baseline + 4} textAnchor="middle" fontFamily={fonts.display} fontSize={size} fill="rgba(27,21,48,0.25)">
        {text}
      </SvgText>
      <SvgText x={width / 2} y={baseline + 2} textAnchor="middle" fontFamily={fonts.display} fontSize={size} fill="#4A4560">
        {text}
      </SvgText>
      <SvgText x={width / 2} y={baseline} textAnchor="middle" fontFamily={fonts.display} fontSize={size} fill="url(#chrome)">
        {text}
      </SvgText>
    </Svg>
  );
}

// Round «lollipop» avatar with the chat's colour, initials or a picture.
export function Lollipop({
  name,
  size = 48,
  online,
  image,
}: {
  name: string;
  size?: number;
  online?: boolean;
  image?: number;
}) {
  const grad = avatarGradient(name);
  const dot = Math.max(10, Math.round(size * 0.31));
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', boxShadow: '0 2px 5px rgba(27,21,48,0.25)' }}>
        <LinearGradient colors={image ? ['#FFE7C2', '#FFB866'] : grad} {...diagonal} style={StyleSheet.absoluteFill} />
        {image ? (
          <Image source={image} style={{ width: size, height: size, transform: [{ translateY: size * 0.08 }, { scale: 1.15 }] }} contentFit="contain" />
        ) : (
          <View style={styles.center}>
            <Text style={{ color: avatarTextColor(grad), fontFamily: fonts.bodyHeavy, fontSize: size * 0.36 }}>{initials(name)}</Text>
          </View>
        )}
        <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} style={[styles.highlight, { height: '45%' }]} pointerEvents="none" />
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2, boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.2)' }]}
        />
      </View>
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: colors.neon,
            borderWidth: 2,
            borderColor: colors.white,
            boxShadow: `0 0 8px ${colors.neonGlow}`,
          }}
        />
      ) : null}
    </View>
  );
}

// Green LCD read-out: timers, pager screens.
export function Lcd({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <View style={styles.lcd}>
      <Text style={{ fontFamily: fonts.mono, fontSize: size, color: colors.lcdText, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

// Delivery ticks: 1 sent · 2 delivered («Получено») · 3 read («Записано на дискету»).
export function Ticks({ count, color }: { count: 1 | 2 | 3; color: string }) {
  return (
    <View style={{ flexDirection: 'row', marginLeft: 3 }}>
      {Array.from({ length: count }, (_, i) => (
        <Svg key={i} width={12} height={10} viewBox="0 0 12 10" style={{ marginLeft: i ? -6 : 0 }}>
          <Path d="M1 5.5 4.2 8.5 11 1.5" stroke={i === 2 ? '#006A84' : color} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ))}
    </View>
  );
}

type IconName = 'pencil' | 'search' | 'chat' | 'person' | 'settings' | 'back';

const ICON_PATHS: Record<IconName, string> = {
  pencil: 'M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20zM14 7l3 3',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  chat: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5',
  settings: 'M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5zM9 8h6M9 12h6M9 16h4',
  back: 'M14.5 5 8 12l6.5 7',
};

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  // The wrapper keeps the icon above absolutely positioned plastic layers on the web.
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path d={ICON_PATHS[name]} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  highlight: { position: 'absolute', left: 0, right: 0, top: 0, height: '42%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chromeButton: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.chromeEdge,
    boxShadow: '0 2px 4px rgba(27,21,48,0.18)',
  },
  chromeButtonText: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.ink },
  lcd: {
    backgroundColor: colors.lcdBg,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    boxShadow: 'inset 0 1px 3px rgba(30,42,16,0.45)',
  },
});
