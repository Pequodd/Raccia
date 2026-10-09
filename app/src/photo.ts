import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { imageSize } from './media/WebFileInput';

const SIZE = 512;

// Pick a picture from the gallery, cut a centred square and shrink it to 512×512 JPEG.
// Returns null if the person changed their mind. Works on the web too (file picker + canvas).
// file: on the web, the picture already chosen through <input type="file">.
export async function pickPhoto(file?: File): Promise<Blob | null> {
  let uri: string;
  let width: number;
  let height: number;
  if (file) {
    if (!file.type.startsWith('image/')) return null;
    uri = URL.createObjectURL(file);
    ({ width, height } = await imageSize(uri));
  } else {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true, // iOS/Android show their own square crop
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return null;
    ({ uri, width, height } = picked.assets[0]);
  }

  const side = Math.min(width, height);
  const ctx = ImageManipulator.manipulate(uri);
  if (width && height && width !== height) {
    ctx.crop({ originX: Math.floor((width - side) / 2), originY: Math.floor((height - side) / 2), width: side, height: side });
  }
  if (!side || side > SIZE) ctx.resize({ width: SIZE, height: SIZE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const blob = await (await fetch(saved.uri)).blob();
  // Some platforms leave the type empty; the server needs to know it is a JPEG.
  return blob.type ? blob : new Blob([blob], { type: 'image/jpeg' });
}
