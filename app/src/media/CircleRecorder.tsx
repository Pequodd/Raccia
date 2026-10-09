import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { CIRCLE_MAX_MS, CIRCLE_SIZE, CircleFrame, type CircleRecorderProps } from './circleUi';

// iPhone / Android: front camera through expo-camera, square-ish H.264 video.
export function CircleRecorder({ visible, onClose, onDone }: CircleRecorderProps) {
  const camera = useRef<CameraView>(null);
  const [cam, requestCam] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    (async () => {
      const c = cam?.granted ? cam : await requestCam();
      const m = mic?.granted ? mic : await requestMic();
      if (!c.granted || !m.granted) setError('Нет доступа к камере или микрофону. Разрешите их в настройках телефона.');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    return () => clearInterval(timer);
  }, [recording]);

  async function record() {
    if (!camera.current) return;
    startedAt.current = Date.now();
    setElapsed(0);
    setRecording(true);
    try {
      const video = await camera.current.recordAsync({ maxDuration: CIRCLE_MAX_MS / 1000, codec: 'avc1' });
      const duration = Date.now() - startedAt.current;
      setRecording(false);
      onClose();
      if (video?.uri && duration >= 800) onDone({ kind: 'circle', uri: video.uri, mime: 'video/mp4', duration, width: 480, height: 480 });
    } catch {
      setRecording(false);
      setError('Не получилось записать. Попробуйте ещё раз.');
    }
  }

  return (
    <CircleFrame
      visible={visible}
      recording={recording}
      elapsed={elapsed}
      error={error}
      onRecord={record}
      onStop={() => camera.current?.stopRecording()}
      onCancel={() => {
        if (recording) {
          // Stop without sending: forget the result.
          startedAt.current = Date.now();
          camera.current?.stopRecording();
        }
        onClose();
      }}
    >
      {visible && cam?.granted && mic?.granted ? (
        <CameraView ref={camera} style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }} facing="front" mode="video" videoQuality="480p" />
      ) : null}
    </CircleFrame>
  );
}
