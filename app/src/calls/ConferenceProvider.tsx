import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useMessenger } from '../store';
import type { CallPeer, CallSignal, ConfEvent, ConfInfo, ConfPerson } from '../types';
import { callsSupported, useCalls } from './CallProvider';
import { tones } from './tones';

// Conferences: everyone in a chat can join; each pair of people is connected directly
// (mesh), which is fine for up to eight. The newcomer sends offers to those already in.
// Screen sharing swaps the video we send for the screen (desktop browsers).

export type ConfPeer = ConfPerson & { stream: MediaStream | null };

type ConfState = {
  info: ConfInfo;
  startedAt: number;
  peers: Record<number, ConfPeer>;
  local: MediaStream;
  muted: boolean;
  cameraOff: boolean;
  sharing: boolean;
  screen: MediaStream | null; // our own screen, for the preview tile
};

type Invite = ConfInfo & { host: CallPeer };

type Conferences = {
  conf: ConfState | null;
  invite: Invite | null;
  joining: boolean;
  error: string | null;
  canShareScreen: boolean;
  start: (chatId: number, video: boolean) => void;
  join: (confId: string, video: boolean) => void;
  dismissInvite: () => void;
  leave: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleScreen: () => void;
};

const ConfContext = createContext<Conferences | null>(null);

export const canShareScreen = callsSupported && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export function ConferenceProvider({ children }: { children: ReactNode }) {
  const { me, sendSocket, onConfEvent } = useMessenger();
  const calls = useCalls();
  const [conf, setConf] = useState<ConfState | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confRef = useRef<ConfState | null>(null);
  confRef.current = conf;
  const localRef = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<number, RTCPeerConnection>());
  const pendingIce = useRef(new Map<number, RTCIceCandidateInit[]>());
  const ice = useRef<RTCIceServer[] | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const screenTrack = useRef<MediaStreamTrack | null>(null);
  const inviteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = useCallback((text: string) => {
    setError(text);
    setTimeout(() => setError((e) => (e === text ? null : e)), 4000);
  }, []);

  const setPeer = useCallback((id: number, patch: Partial<ConfPeer> | null) => {
    setConf((c) => {
      if (!c) return c;
      const peers = { ...c.peers };
      if (patch === null) delete peers[id];
      else peers[id] = { ...(peers[id] ?? { id, name: '…', avatar: null, screen: false, stream: null }), ...patch };
      return { ...c, peers };
    });
  }, []);

  const cleanup = useCallback(() => {
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    pendingIce.current.clear();
    screenTrack.current?.stop();
    screenTrack.current = null;
    camTrack.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    setConf(null);
    setJoining(false);
  }, []);

  const signal = useCallback(
    (to: number, data: CallSignal) => {
      const id = confRef.current?.info.id;
      if (id) sendSocket({ type: 'conf_signal', confId: id, to, data });
    },
    [sendSocket]
  );

  const videoSender = (pc: RTCPeerConnection) =>
    pc.getTransceivers().find((t) => (t.sender.track ?? t.receiver.track)?.kind === 'video')?.sender;

  const peerConnection = useCallback(
    (peerId: number) => {
      const existing = pcs.current.get(peerId);
      if (existing) return existing;
      const local = localRef.current!;
      const pc = new RTCPeerConnection({ iceServers: ice.current ?? [{ urls: 'stun:stun.l.google.com:19302' }] });
      pcs.current.set(peerId, pc);
      local.getTracks().forEach((t) => pc.addTrack(t, local));
      const stream = new MediaStream();
      pc.ontrack = (e) => {
        if (!stream.getTracks().includes(e.track)) stream.addTrack(e.track);
        setPeer(peerId, { stream });
      };
      pc.onicecandidate = (e) => e.candidate && signal(peerId, { candidate: e.candidate.toJSON() });
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') pc.restartIce?.();
      };
      return pc;
    },
    [setPeer, signal]
  );

  // Newcomer → each person already inside.
  const callPeer = useCallback(
    async (peerId: number) => {
      const pc = peerConnection(peerId);
      // Audio-only: keep a video slot open so a screen can be shown later without renegotiating.
      if (!localRef.current?.getVideoTracks().length) pc.addTransceiver('video', { direction: 'sendrecv' });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(peerId, { sdp: pc.localDescription!.toJSON() });
    },
    [peerConnection, signal]
  );

  useEffect(() => {
    return onConfEvent(async (event: ConfEvent) => {
      switch (event.type) {
        case 'conf_joined': {
          if (!localRef.current) return sendSocket({ type: 'conf_leave', confId: event.conf.id });
          tones.stop();
          setJoining(false);
          setInvite(null);
          const peers: Record<number, ConfPeer> = {};
          for (const p of event.peers) peers[p.id] = { ...p, stream: null };
          setConf({ info: event.conf, startedAt: Date.now(), peers, local: localRef.current, muted: false, cameraOff: false, sharing: false, screen: null });
          confRef.current = { info: event.conf } as ConfState;
          for (const p of event.peers) await callPeer(p.id);
          break;
        }
        case 'conf_invite':
          if (confRef.current || calls.call) break;
          setInvite(event.conf);
          tones.ring();
          if (inviteTimer.current) clearTimeout(inviteTimer.current);
          inviteTimer.current = setTimeout(() => {
            tones.stop();
            setInvite((i) => (i?.id === event.conf.id ? null : i));
          }, 30_000);
          break;
        case 'conf_peer_joined':
          if (confRef.current?.info.id === event.confId) setPeer(event.peer.id, { ...event.peer });
          break;
        case 'conf_peer_left':
          pcs.current.get(event.userId)?.close();
          pcs.current.delete(event.userId);
          setPeer(event.userId, null);
          break;
        case 'conf_signal': {
          if (confRef.current?.info.id !== event.confId || !localRef.current) break;
          const pc = peerConnection(event.from);
          const { sdp, candidate } = event.data;
          if (sdp) {
            await pc.setRemoteDescription(sdp);
            if (sdp.type === 'offer') {
              // Let our screen go out later through the video slot the caller opened.
              pc.getTransceivers().forEach((t) => {
                if (t.receiver.track?.kind === 'video' && t.direction === 'recvonly') t.direction = 'sendrecv';
              });
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              signal(event.from, { sdp: pc.localDescription!.toJSON() });
            }
            for (const c of pendingIce.current.get(event.from)?.splice(0) ?? []) await pc.addIceCandidate(c).catch(() => {});
          } else if (candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {});
            else pendingIce.current.set(event.from, [...(pendingIce.current.get(event.from) ?? []), candidate]);
          }
          break;
        }
        case 'conf_screen':
          setPeer(event.userId, { screen: event.on });
          break;
        case 'conf_left':
          cleanup();
          break;
        case 'conf_error':
          localRef.current?.getTracks().forEach((t) => t.stop());
          if (!confRef.current) localRef.current = null;
          setJoining(false);
          fail(event.error);
          break;
      }
    });
  }, [onConfEvent, callPeer, peerConnection, setPeer, signal, cleanup, fail, sendSocket, calls.call]);

  const getMedia = useCallback(async (video: boolean) => {
    if (!callsSupported) {
      fail('Конференции пока работают в веб-версии и в приложении с экрана «Домой».');
      return null;
    }
    if (calls.call || confRef.current) {
      fail('Сначала закончите текущий разговор');
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
      camTrack.current = stream.getVideoTracks()[0] ?? null;
      ice.current = (await api.turn().catch(() => null))?.iceServers ?? null;
      return stream;
    } catch {
      fail('Нет доступа к микрофону или камере. Разрешите их для этого сайта.');
      return null;
    }
  }, [calls.call, fail]);

  const start = useCallback(async (chatId: number, video: boolean) => {
    setJoining(true);
    const stream = await getMedia(video);
    if (!stream) return setJoining(false);
    localRef.current = stream;
    sendSocket({ type: 'conf_start', chatId, video });
  }, [getMedia, sendSocket]);

  const join = useCallback(async (confId: string, video: boolean) => {
    tones.stop();
    setJoining(true);
    const stream = await getMedia(video);
    if (!stream) return setJoining(false);
    localRef.current = stream;
    sendSocket({ type: 'conf_join', confId });
  }, [getMedia, sendSocket]);

  const dismissInvite = useCallback(() => {
    tones.stop();
    setInvite(null);
  }, []);

  const leave = useCallback(() => {
    const id = confRef.current?.info.id;
    if (id) sendSocket({ type: 'conf_leave', confId: id });
    cleanup();
  }, [sendSocket, cleanup]);

  const toggleMute = useCallback(() => {
    const c = confRef.current;
    if (!c?.local) return;
    c.local.getAudioTracks().forEach((t) => (t.enabled = c.muted));
    setConf((s) => (s ? { ...s, muted: !s.muted } : s));
  }, []);

  const toggleCamera = useCallback(() => {
    const t = camTrack.current;
    if (!t) return;
    t.enabled = !t.enabled;
    setConf((s) => (s ? { ...s, cameraOff: !t.enabled } : s));
  }, []);

  const stopScreen = useCallback(() => {
    screenTrack.current?.stop();
    screenTrack.current = null;
    for (const pc of pcs.current.values()) videoSender(pc)?.replaceTrack(camTrack.current).catch(() => {});
    const id = confRef.current?.info.id;
    if (id) sendSocket({ type: 'conf_screen', confId: id, on: false });
    setConf((s) => (s ? { ...s, sharing: false, screen: null } : s));
  }, [sendSocket]);

  const toggleScreen = useCallback(async () => {
    if (screenTrack.current) return stopScreen();
    if (!canShareScreen) return fail('Демонстрация экрана работает в браузере на компьютере.');
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = display.getVideoTracks()[0];
      screenTrack.current = track;
      track.onended = stopScreen; // «Прекратить показ» in the browser's own bar
      for (const pc of pcs.current.values()) await videoSender(pc)?.replaceTrack(track).catch(() => {});
      const id = confRef.current?.info.id;
      if (id) sendSocket({ type: 'conf_screen', confId: id, on: true });
      setConf((s) => (s ? { ...s, sharing: true, screen: display } : s));
    } catch {
      // the person closed the picker
    }
  }, [stopScreen, fail, sendSocket]);

  useEffect(() => () => cleanup(), [me.id, cleanup]);

  return (
    <ConfContext.Provider
      value={{ conf, invite, joining, error, canShareScreen, start, join, dismissInvite, leave, toggleMute, toggleCamera, toggleScreen }}
    >
      {children}
    </ConfContext.Provider>
  );
}

export function useConference() {
  const ctx = useContext(ConfContext);
  if (!ctx) throw new Error('useConference must be used inside ConferenceProvider');
  return ctx;
}
