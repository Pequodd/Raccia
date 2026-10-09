import { getAuthToken } from '../api';
import { API_URL } from '../config';
import type { MediaDraft, Message } from '../types';

// One line for a message in the chat list and the banner: «📷 Фото · подпись», «📞 Пропущенный звонок».
export function messagePreview(m: Pick<Message, 'kind' | 'body'>) {
  if (m.kind === 'call') return `📞 ${m.body}`;
  const label = m.kind in MEDIA_LABELS ? MEDIA_LABELS[m.kind as keyof typeof MEDIA_LABELS] : null;
  return label ? (m.body ? `${label} · ${m.body}` : label) : m.body;
}

export const MEDIA_LABELS = {
  meetup: '🍺 Сходка',
  image: '📷 Фото',
  video: '🎬 Видео',
  voice: '🎤 Голосовое',
  circle: '⭕ Кружок',
};

export const mediaUrl = (file: string) => `${API_URL}/media/${file}`;

// Upload an attachment with progress (fetch cannot report upload progress, XHR can).
export async function uploadMedia(chatId: number, draft: MediaDraft, onProgress: (p: number) => void): Promise<Message> {
  const body = draft.blob ?? (await (await fetch(draft.uri)).blob());
  const params: Record<string, string | number | undefined> = {
    kind: draft.kind,
    caption: draft.caption?.trim() || undefined,
    width: draft.width,
    height: draft.height,
    duration: draft.duration,
  };
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/api/chats/${chatId}/media?${query}`);
    xhr.setRequestHeader('Content-Type', draft.mime.split(';')[0] || 'application/octet-stream');
    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: { message?: Message; error?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // not JSON: the proxy answered
      }
      if (xhr.status === 201 && data.message) resolve(data.message);
      else reject(new Error(data.error ?? (xhr.status === 413 ? 'Файл слишком большой' : `Ошибка ${xhr.status}`)));
    };
    xhr.onerror = () => reject(new Error('Нет связи с сервером'));
    xhr.send(body);
  });
}
