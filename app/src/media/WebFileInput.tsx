import { createElement } from 'react';
import { Platform } from 'react-native';

// Web: a real, invisible <input type="file"> laid over a button. The tap lands on the
// input itself, so every browser (iPhone Safari included) opens its picker; clicking a
// hidden input from code is sometimes ignored. Renders nothing in the native apps.
export function WebFileInput({
  accept,
  capture,
  label,
  onFile,
}: {
  accept: string;
  capture?: 'user' | 'environment';
  label: string;
  onFile: (file: File) => void;
}) {
  if (Platform.OS !== 'web') return null;
  return createElement('input', {
    type: 'file',
    accept,
    capture,
    'aria-label': label,
    title: label,
    onChange: (e: { target: HTMLInputElement }) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // the same file can be picked again
      if (file) onFile(file);
    },
    style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', zIndex: 2 },
  });
}

// Size of a picture from a URL (blob: or data:), for cropping and resizing.
export function imageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Не получилось открыть картинку'));
    img.src = uri;
  });
}

// Width, height and length of a video file, if the browser can read them (it may not for
// some formats: the server works the length out itself).
export function videoInfo(uri: string): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const done = (info: { width?: number; height?: number; duration?: number }) => {
      clearTimeout(timer);
      resolve(info);
    };
    const timer = setTimeout(() => done({}), 4000);
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () =>
      done({
        width: v.videoWidth || undefined,
        height: v.videoHeight || undefined,
        duration: Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : undefined,
      });
    v.onerror = () => done({});
    v.src = uri;
  });
}
