import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Recording = { uri: string; blob?: Blob; mime: string; duration: number };

export type VoiceRecorder = {
  recording: boolean;
  elapsed: number; // ms
  error: string | null;
  start: () => Promise<boolean>;
  stop: () => Promise<Recording | null>; // null: too short or nothing recorded
  cancel: () => void;
};

// iPhone / Android: expo-audio, AAC in .m4a.
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(timer);
  }, [recording]);

  const start = useCallback(async () => {
    setError(null);
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к микрофону. Разрешите его в настройках телефона.');
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    return true;
  }, [recorder]);

  const finish = useCallback(async () => {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    setRecording(false);
    setElapsed(0);
  }, [recorder]);

  const stop = useCallback(async () => {
    const duration = Date.now() - startedAt.current;
    await finish();
    if (duration < 600 || !recorder.uri) return null;
    return { uri: recorder.uri, mime: 'audio/mp4', duration };
  }, [finish, recorder]);

  const cancel = useCallback(() => {
    finish().catch(() => {});
  }, [finish]);

  return { recording, elapsed, error, start, stop, cancel };
}
