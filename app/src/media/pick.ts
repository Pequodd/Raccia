import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { MediaDraft } from '../types';

const MAX_SIDE = 1600; // photos are shrunk to this, like Telegram's «compressed» photos
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export class PickError extends Error {}

// Photo or video from the gallery, or a fresh shot from the camera.
export async function pickAttachment(source: 'library' | 'camera'): Promise<MediaDraft | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images', 'videos'],
    quality: 1,
    videoMaxDuration: 600,
    // iPhone: hand over H.264 720p instead of HEVC — smaller, and every phone can play it.
    videoExportPreset: ImagePicker.VideoExportPreset.H264_1280x720,
  };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) throw new PickError('Нет доступа к камере. Разрешите его в настройках телефона.');
    }
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];

  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) {
    const size = asset.fileSize ?? asset.file?.size ?? 0;
    if (size > MAX_VIDEO_BYTES) throw new PickError('Видео больше 100 МБ. Обрежьте его или выберите покороче.');
    return {
      kind: 'video',
      uri: asset.uri,
      blob: asset.file ?? undefined,
      mime: asset.mimeType ?? asset.file?.type ?? 'video/mp4',
      width: asset.width || undefined,
      height: asset.height || undefined,
      duration: asset.duration ?? undefined,
    };
  }

  // GIFs stay as they are (shrinking would stop the animation).
  if (asset.mimeType === 'image/gif') {
    return { kind: 'image', uri: asset.uri, blob: asset.file ?? undefined, mime: 'image/gif', width: asset.width, height: asset.height };
  }
  return shrinkPhoto(asset.uri, asset.width, asset.height);
}

async function shrinkPhoto(uri: string, width: number, height: number): Promise<MediaDraft> {
  const ctx = ImageManipulator.manipulate(uri);
  const scale = Math.min(1, MAX_SIDE / Math.max(width || MAX_SIDE, height || MAX_SIDE));
  if (scale < 1) ctx.resize({ width: Math.round(width * scale), height: Math.round(height * scale) });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82 });
  const blob = Platform.OS === 'web' ? await (await fetch(saved.uri)).blob() : undefined;
  return { kind: 'image', uri: saved.uri, blob, mime: 'image/jpeg', width: saved.width, height: saved.height };
}
