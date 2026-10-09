import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceRecorder } from './useVoiceRecorder';

// Browsers: MediaRecorder. AAC in MP4 where the browser can (Safari, new Chrome) —
// that plays everywhere, iPhone included; otherwise Opus in WebM/Ogg.
const TYPES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];

export function useVoiceRecorder(): VoiceRecorder {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number } | null>(null);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - (rec.current?.startedAt ?? Date.now())), 200);
    return () => clearInterval(timer);
  }, [recording]);

  const release = () => {
    rec.current?.stream.getTracks().forEach((t) => t.stop());
    rec.current = null;
    setRecording(false);
    setElapsed(0);
  };
  useEffect(() => () => release(), []);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Этот браузер не умеет записывать звук.');
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError('Нет доступа к микрофону. Разрешите его для этого сайта.');
      return false;
    }
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 48000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(250);
    rec.current = { recorder, stream, chunks, startedAt: Date.now() };
    setElapsed(0);
    setRecording(true);
    return true;
  }, []);

  const stop = useCallback(async () => {
    const r = rec.current;
    if (!r) return null;
    const duration = Date.now() - r.startedAt;
    await new Promise<void>((resolve) => {
      r.recorder.onstop = () => resolve();
      r.recorder.stop();
    });
    const mime = (r.recorder.mimeType || 'audio/webm').split(';')[0];
    const blob = new Blob(r.chunks, { type: mime });
    release();
    if (duration < 600 || !blob.size) return null; // a slip of the finger
    return { uri: URL.createObjectURL(blob), blob, mime, duration };
  }, []);

  const cancel = useCallback(() => {
    const r = rec.current;
    if (r && r.recorder.state !== 'inactive') r.recorder.stop();
    release();
  }, []);

  return { recording, elapsed, error, start, stop, cancel };
}
