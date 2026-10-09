import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSkin } from '../skins';

const PHONE = 'M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z';
const CAMERA = 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z';

// 📞 and 🎥 in a chat header. color: what the header's text uses.
export function CallButtons({ onCall, color, size = 22 }: { onCall: (video: boolean) => void; color?: string; size?: number }) {
  const { colors } = useSkin();
  const ink = color ?? colors.chromeInk;
  return (
    <View style={{ flexDirection: 'row' }}>
      {([false, true] as const).map((video) => (
        <Pressable
          key={String(video)}
          onPress={() => onCall(video)}
          style={({ pressed }) => [{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={video ? 'Видеозвонок' : 'Позвонить'}
        >
          <Svg width={size} height={size} viewBox="0 0 24 24">
            <Path d={video ? CAMERA : PHONE} fill={ink} />
          </Svg>
        </Pressable>
      ))}
    </View>
  );
}
