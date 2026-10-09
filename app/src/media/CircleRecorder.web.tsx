import { createElement, useEffect, useRef, useState } from 'react';
import { CIRCLE_MAX_MS, CircleFrame, type CircleRecorderProps } from './circleUi';

// Browsers: front camera via getUserMedia, recorded with MediaRecorder.
// MP4 (H.264 + AAC) where possible so iPhones can play it; WebM otherwise.
const TYPES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function CircleRecorder({ visible, onClose, onDone }: CircleRecorderProps) {
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; chunks: Blob[]; startedAt: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Этот браузер не умеет записывать видео.');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } }, audio: { echoCancellation: true } })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError('Нет доступа к камере или микрофону. Разрешите их для этого сайта.'));
    return () => {
      cancelled = true;
      rec.current?.recorder.state === 'recording' && rec.current.recorder.stop();
      rec.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setRecording(false);
      setElapsed(0);
    };
  }, [visible]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const ms = Date.now() - (rec.current?.startedAt ?? Date.now());
      setElapsed(ms);
      if (ms >= CIRCLE_MAX_MS) stop();
    }, 200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  function record() {
    if (!stream.current) return;
    const mimeType = TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const recorder = new MediaRecorder(stream.current, mimeType ? { mimeType, videoBitsPerSecond: 1_000_000 } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start(500);
    rec.current = { recorder, chunks, startedAt: Date.now() };
    setElapsed(0);
    setRecording(true);
  }

  function stop() {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const duration = Date.now() - r.startedAt;
    r.recorder.onstop = () => {
      const mime = (r.recorder.mimeType || 'video/webm').split(';')[0];
      const blob = new Blob(r.chunks, { type: mime });
      const settings = stream.current?.getVideoTracks()[0]?.getSettings();
      setRecording(false);
      onClose();
      if (duration < 800 || !blob.size) return;
      onDone({ kind: 'circle', uri: URL.createObjectURL(blob), blob, mime, duration, width: settings?.width, height: settings?.height });
    };
    r.recorder.stop();
  }

  return (
    <CircleFrame visible={visible} recording={recording} elapsed={elapsed} error={error} onRecord={record} onStop={stop} onCancel={onClose}>
      {createElement('video', {
        ref: video,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' },
      })}
    </CircleFrame>
  );
}
