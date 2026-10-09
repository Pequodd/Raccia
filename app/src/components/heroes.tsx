import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { makeStyles, useSkin } from '../skins';
import { stickers } from './y2k';

// Winamp title strip: gold grip lines either side of a spaced-out caption.
export function TitleStrip({ title }: { title: string }) {
  const styles = useStyles();
  const grip = (
    <View style={styles.grip}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={styles.gripLine} />
      ))}
    </View>
  );
  return (
    <View style={styles.strip}>
      {grip}
      <Text style={styles.stripTitle}>{title}</Text>
      {grip}
    </View>
  );
}

const BARS = 14;

// Bars that bounce like a spectrum analyser.
function Equalizer({ height }: { height: number }) {
  const styles = useStyles();
  const [levels, setLevels] = useState(() => Array.from({ length: BARS }, (_, i) => 0.3 + ((i * 37) % 60) / 100));
  useEffect(() => {
    const timer = setInterval(() => {
      setLevels((prev) => prev.map((v) => Math.min(1, Math.max(0.12, v + (Math.random() - 0.5) * 0.45))));
    }, 160);
    return () => clearInterval(timer);
  }, []);
  return (
    <View style={[styles.eq, { height }]}>
      {levels.map((v, i) => (
        <View key={i} style={[styles.eqBar, { height: Math.round(v * (height - 6)) }]}>
          <LinearGradient
            colors={['#FF3B3B', '#F2D21A', '#2ECC40']}
            locations={[0, 0.2, 0.45]}
            style={[styles.eqFill, { height: height - 6 }]}
          />
        </View>
      ))}
    </View>
  );
}

// LCD line that scrolls right to left forever.
function Marquee({ text }: { text: string }) {
  const styles = useStyles();
  const x = useRef(new Animated.Value(0)).current;
  const [boxWidth, setBoxWidth] = useState(0);
  const textWidth = Math.ceil(text.length * 7.6);
  useEffect(() => {
    if (!boxWidth) return;
    x.setValue(boxWidth);
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: -textWidth,
        duration: ((boxWidth + textWidth) / 40) * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [boxWidth, textWidth, x]);
  return (
    <View style={styles.marquee} onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)}>
      <Animated.Text style={[styles.marqueeText, { width: textWidth, transform: [{ translateX: x }] }]}>
        {text}
      </Animated.Text>
    </View>
  );
}

// Login hero of the Winamp skin: a little player with Oleg on the «cover».
export function PlayerHero() {
  const skin = useSkin();
  const styles = useStyles();
  return (
    <View style={styles.player}>
      <TitleStrip title={skin.copy.heroTitle ?? 'ОЛЕГ'} />
      <View style={styles.playerBody}>
        <View style={styles.cover}>
          <Image source={stickers.idea} style={styles.coverImage} contentFit="contain" />
          <Text style={styles.coverTime}>▶ 00:00</Text>
        </View>
        <View style={styles.playerRight}>
          <Marquee text={skin.copy.heroMarquee ?? skin.copy.slogan} />
          <View style={styles.tags}>
            <Text style={styles.tag}>128</Text>
            <Text style={styles.tagLabel}>кбит</Text>
            <Text style={styles.tag}>44</Text>
            <Text style={styles.tagLabel}>кгц</Text>
          </View>
          <Equalizer height={58} />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, fonts, chrome, frames }) => ({
  strip: { height: 20, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  grip: { flex: 1, height: 7, justifyContent: 'space-between' },
  gripLine: { height: 1, backgroundColor: '#D9B44A' },
  stripTitle: { fontFamily: fonts.display, fontSize: 11, letterSpacing: 2.6, color: '#E8D9A0' },
  player: {
    backgroundColor: chrome.colors[0],
    ...frames.panel,
  },
  playerBody: { flexDirection: 'row', gap: 8, padding: 8, paddingTop: 2 },
  cover: { width: 112, height: 112, backgroundColor: colors.lcdBg, ...frames.field, overflow: 'hidden' },
  coverImage: { position: 'absolute', width: 124, height: 124, left: -6, top: 0 },
  coverTime: { position: 'absolute', left: 4, top: 3, fontFamily: fonts.mono, fontSize: 10, color: colors.lcdText },
  playerRight: { flex: 1, gap: 6 },
  marquee: { height: 22, backgroundColor: colors.lcdBg, ...frames.field, overflow: 'hidden', justifyContent: 'center' },
  marqueeText: { position: 'absolute', left: 0, top: 3, flexShrink: 0, fontFamily: fonts.mono, fontSize: 11, color: colors.lcdText },
  tags: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tag: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.lcdText,
    backgroundColor: colors.lcdBg,
    paddingHorizontal: 4,
    ...frames.field,
  },
  tagLabel: { fontFamily: fonts.mono, fontSize: 10, color: colors.text2, marginRight: 4 },
  eq: {
    backgroundColor: colors.lcdBg,
    ...frames.field,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    padding: 3,
  },
  eqBar: { flex: 1, overflow: 'hidden', justifyContent: 'flex-end' },
  eqFill: { width: '100%' },
}));
