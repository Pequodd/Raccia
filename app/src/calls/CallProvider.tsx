import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api } from '../api';
import { useMessenger } from '../store';
import type { CallEvent, CallInfo, CallSignal } from '../types';
import { tones } from './tones';

// One call at a time, 1:1. The server rings and relays signalling; media goes over WebRTC.
// Works in browsers and the installed PWA (iPhone, Android, desktop). The native apps
// need a WebRTC module and will get calls in a later build.

export type CallStatus = 'outgoing' | 'incoming' | 'connecting' | 'active';

export type CallState = {
  info: CallInfo | null; // null until the server confirms an outgoing call
  chatId: number;
  peerName: string;
  peerAvatar: string | null;
  video: boolean;
  outgoing: boolean;
  status: CallStatus;
  startedAt: number | null; // when media started flowing
  local: MediaStream | null;
  remote: MediaStream | null;
  muted: boolean;
  cameraOff: boolean;
};

type Calls = {
  call: CallState | null;
  notice: string | null; // «Абонент занят», «Звонок завершён» …
  supported: boolean;
  start: (chatId: number, video: boolean, peer: { name: string; avatar: string | null }) => void;
  accept: () => void;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => void;
};

const CallContext = createContext<Calls | null>(null);

export const callsSupported =
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

const ENDED_TEXT: Record<string, string> = {
  ended: 'Звонок завершён',
  missed: 'Не ответили',
  declined: 'Звонок отклонён',
  canceled: 'Звонок отменён',
  failed: 'Связь оборвалась',
};

function media(video: boolean, facing: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

function mediaError(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Нет доступа к микрофону или камере. Разрешите их для этого сайта.';
  if (name === 'NotFoundError') return 'Не нашли микрофон или камеру.';
  return 'Не получилось включить микрофон или камеру.';
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { me, sendSocket, onCallEvent } = useMessenger();
  const [call, setCall] = useState<CallState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const callRef = useRef<CallState | null>(null);
  callRef.current = call;
  const pc = useRef<RTCPeerConnection | null>(null);
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const acceptedHere = useRef(false);
  const facing = useRef<'user' | 'environment'>('user');
  const dropTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((p: Partial<CallState>) => setCall((c) => (c ? { ...c, ...p } : c)), []);

  const say = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 3000);
  }, []);

  const cleanup = useCallback(() => {
    tones.stop();
    if (dropTimer.current) clearTimeout(dropTimer.current);
    pc.current?.close();
    pc.current = null;
    pendingIce.current = [];
    acceptedHere.current = false;
    const c = callRef.current;
    c?.local?.getTracks().forEach((t) => t.stop());
    setCall(null);
  }, []);

  const signal = useCallback((data: CallSignal) => {
    const id = callRef.current?.info?.id;
    if (id) sendSocket({ type: 'call_signal', callId: id, data });
  }, [sendSocket]);

  // The peer connection, set up the same way on both sides.
  const connect = useCallback(async (local: MediaStream) => {
    const { iceServers } = await api.turn().catch(() => ({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }));
    const conn = new RTCPeerConnection({ iceServers });
    pc.current = conn;
    local.getTracks().forEach((t) => conn.addTrack(t, local));
    const remote = new MediaStream();
    patch({ remote });
    conn.ontrack = (e) => {
      e.streams[0]?.getTracks().forEach((t) => remote.getTracks().includes(t) || remote.addTrack(t));
      if (!e.streams[0] && !remote.getTracks().includes(e.track)) remote.addTrack(e.track);
      patch({ remote });
    };
    conn.onicecandidate = (e) => e.candidate && signal({ candidate: e.candidate.toJSON() });
    conn.onconnectionstatechange = () => {
      const state = conn.connectionState;
      if (state === 'connected') {
        if (dropTimer.current) clearTimeout(dropTimer.current);
        tones.stop();
        setCall((c) => (c ? { ...c, status: 'active', startedAt: c.startedAt ?? Date.now() } : c));
      } else if (state === 'disconnected') {
        // A short drop (switching Wi-Fi to mobile) may heal itself.
        dropTimer.current = setTimeout(() => {
          if (pc.current === conn && conn.connectionState !== 'connected') {
            const id = callRef.current?.info?.id;
            if (id) sendSocket({ type: 'call_failed', callId: id });
            cleanup();
            say(ENDED_TEXT.failed);
          }
        }, 10_000);
      } else if (state === 'failed') {
        const id = callRef.current?.info?.id;
        if (id) sendSocket({ type: 'call_failed', callId: id });
        cleanup();
        say(ENDED_TEXT.failed);
      }
    };
    return conn;
  }, [patch, signal, sendSocket, cleanup, say]);

  const flushIce = useCallback(async () => {
    const conn = pc.current;
    if (!conn?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) await conn.addIceCandidate(c).catch(() => {});
  }, []);

  useEffect(() => {
    return onCallEvent(async (event: CallEvent) => {
      const current = callRef.current;
      switch (event.type) {
        case 'call_ringing':
          if (current?.outgoing && current.chatId === event.call.chatId) patch({ info: event.call });
          break;

        case 'call_incoming': {
          if (current) {
            // Already on a call: the server would not ring us, but a reconnect may repeat it.
            if (current.info?.id !== event.call.id) sendSocket({ type: 'call_decline', callId: event.call.id });
            break;
          }
          const c = event.call;
          setCall({
            info: c,
            chatId: c.chatId,
            peerName: c.from.name,
            peerAvatar: c.from.avatar,
            video: c.video,
            outgoing: false,
            status: 'incoming',
            startedAt: null,
            local: null,
            remote: null,
            muted: false,
            cameraOff: false,
          });
          tones.ring();
          break;
        }

        case 'call_accepted': {
          // Caller: the other side picked up — make the offer.
          if (!current?.outgoing || current.info?.id !== event.callId || !current.local) break;
          tones.stop();
          patch({ status: 'connecting' });
          const conn = await connect(current.local);
          const offer = await conn.createOffer();
          await conn.setLocalDescription(offer);
          signal({ sdp: conn.localDescription!.toJSON() });
          break;
        }

        case 'call_answered_elsewhere':
          if (current?.info?.id === event.callId && !acceptedHere.current) cleanup();
          break;

        case 'call_signal': {
          if (current?.info?.id !== event.callId) break;
          const conn = pc.current;
          const { sdp, candidate } = event.data;
          if (sdp && conn) {
            await conn.setRemoteDescription(sdp);
            if (sdp.type === 'offer') {
              const answer = await conn.createAnswer();
              await conn.setLocalDescription(answer);
              signal({ sdp: conn.localDescription!.toJSON() });
            }
            await flushIce();
          } else if (candidate) {
            if (conn?.remoteDescription) await conn.addIceCandidate(candidate).catch(() => {});
            else pendingIce.current.push(candidate);
          }
          break;
        }

        case 'call_ended':
          if (current?.info?.id === event.callId) {
            cleanup();
            say(ENDED_TEXT[event.outcome] ?? ENDED_TEXT.ended);
          }
          break;

        case 'call_busy':
          if (current?.outgoing) {
            cleanup();
            say('Абонент сейчас разговаривает');
          }
          break;

        case 'call_error':
          cleanup();
          say(event.error);
          break;
      }
    });
  }, [onCallEvent, patch, connect, signal, flushIce, cleanup, say, sendSocket]);

  // Leaving the page mid-call: tell the other side instead of leaving them hanging.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const bye = () => {
      const id = callRef.current?.info?.id;
      if (id) sendSocket({ type: 'call_hangup', callId: id });
    };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [sendSocket]);

  const start = useCallback(async (chatId: number, video: boolean, peer: { name: string; avatar: string | null }) => {
    if (!callsSupported) return say('Звонки пока работают в веб-версии и в приложении с экрана «Домой».');
    if (callRef.current) return;
    let local: MediaStream;
    try {
      local = await media(video);
    } catch (e) {
      return say(mediaError(e));
    }
    setCall({
      info: null,
      chatId,
      peerName: peer.name,
      peerAvatar: peer.avatar,
      video,
      outgoing: true,
      status: 'outgoing',
      startedAt: null,
      local,
      remote: null,
      muted: false,
      cameraOff: false,
    });
    tones.ringback();
    sendSocket({ type: 'call_invite', chatId, video });
  }, [sendSocket, say]);

  const accept = useCallback(async () => {
    const c = callRef.current;
    if (!c?.info || c.status !== 'incoming') return;
    tones.stop();
    if (!callsSupported) {
      sendSocket({ type: 'call_decline', callId: c.info.id });
      cleanup();
      return say('Звонки пока работают в веб-версии и в приложении с экрана «Домой».');
    }
    let local: MediaStream;
    try {
      local = await media(c.video);
    } catch (e) {
      sendSocket({ type: 'call_decline', callId: c.info.id });
      cleanup();
      return say(mediaError(e));
    }
    acceptedHere.current = true;
    patch({ local, status: 'connecting' });
    callRef.current = { ...c, local, status: 'connecting' };
    await connect(local);
    sendSocket({ type: 'call_accept', callId: c.info.id });
  }, [connect, patch, sendSocket, cleanup, say]);

  const decline = useCallback(() => {
    const id = callRef.current?.info?.id;
    if (id) sendSocket({ type: 'call_decline', callId: id });
    cleanup();
  }, [sendSocket, cleanup]);

  const hangup = useCallback(() => {
    const c = callRef.current;
    if (c?.info) sendSocket({ type: 'call_hangup', callId: c.info.id });
    cleanup();
    if (c) say(c.status === 'active' ? ENDED_TEXT.ended : ENDED_TEXT.canceled);
  }, [sendSocket, cleanup, say]);

  const toggleMute = useCallback(() => {
    const c = callRef.current;
    if (!c?.local) return;
    const muted = !c.muted;
    c.local.getAudioTracks().forEach((t) => (t.enabled = !muted));
    patch({ muted });
  }, [patch]);

  const toggleCamera = useCallback(() => {
    const c = callRef.current;
    if (!c?.local) return;
    const cameraOff = !c.cameraOff;
    c.local.getVideoTracks().forEach((t) => (t.enabled = !cameraOff));
    patch({ cameraOff });
  }, [patch]);

  // Front ↔ back camera on phones: swap the video track without renegotiating.
  const flipCamera = useCallback(async () => {
    const c = callRef.current;
    if (!c?.local || !c.video) return;
    facing.current = facing.current === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing.current } });
      const track = fresh.getVideoTracks()[0];
      const sender = pc.current?.getSenders().find((s) => s.track?.kind === 'video');
      await sender?.replaceTrack(track);
      c.local.getVideoTracks().forEach((t) => {
        c.local!.removeTrack(t);
        t.stop();
      });
      c.local.addTrack(track);
      patch({ local: c.local, cameraOff: false });
    } catch {
      say('Не получилось переключить камеру');
    }
  }, [patch, say]);

  useEffect(() => () => cleanup(), [cleanup]);
  useEffect(() => {
    // Logged out or switched accounts: no call survives.
    return () => cleanup();
  }, [me.id, cleanup]);

  return (
    <CallContext.Provider value={{ call, notice, supported: callsSupported, start, accept, decline, hangup, toggleMute, toggleCamera, flipCamera }}>
      {children}
    </CallContext.Provider>
  );
}

export function useCalls() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCalls must be used inside CallProvider');
  return ctx;
}
