import { createHmac, randomBytes } from 'node:crypto';

// Audio and video calls between two people (direct chats). The server only rings,
// relays WebRTC signalling (SDP offers/answers and ICE candidates) and writes the call
// into the chat afterwards; the media goes peer to peer, or through the TURN server
// when phones sit behind strict NATs.

const RING_MS = 40_000;
const MAX_SIGNAL = 64 * 1024;

export function formatCallDuration(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// TURN credentials in the coturn «use-auth-secret» scheme: valid for a day, nothing stored.
export function iceServers(userId, { turnHost, turnSecret } = {}) {
  const servers = [];
  if (turnHost) {
    servers.push({ urls: `stun:${turnHost}:3478` });
    if (turnSecret) {
      const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:${userId}`;
      const credential = createHmac('sha1', turnSecret).update(username).digest('base64');
      servers.push({ urls: [`turn:${turnHost}:3478?transport=udp`, `turn:${turnHost}:3478?transport=tcp`], username, credential });
    }
  }
  servers.push({ urls: 'stun:stun.l.google.com:19302' });
  return servers;
}

// deps: send(userId, event), isWatching(userId), notify(userId, payload), postCall(call, outcome, duration),
//       userCard(userId) → { id, name, avatar }, directPeer(chatId, userId) → other member id or null
export function createCalls(deps) {
  const calls = new Map(); // id → call
  const byUser = new Map(); // userId → call id

  const other = (call, userId) => (call.from === userId ? call.to : call.from);
  const view = (call) => ({ id: call.id, chatId: call.chatId, video: call.video, from: deps.userCard(call.from), to: deps.userCard(call.to) });

  function end(call, outcome) {
    if (!calls.has(call.id)) return;
    clearTimeout(call.timer);
    calls.delete(call.id);
    byUser.delete(call.from);
    byUser.delete(call.to);
    for (const uid of [call.from, call.to]) deps.send(uid, { type: 'call_ended', callId: call.id, outcome });
    deps.postCall(call, outcome, call.answeredAt ? Date.now() - call.answeredAt : 0);
  }

  function invite(userId, { chatId, video }, ws) {
    const to = deps.directPeer(Number(chatId), userId);
    if (!to) return deps.send(userId, { type: 'call_error', error: 'Звонить можно в личном чате' });
    if (byUser.has(userId) || byUser.has(to)) return deps.send(userId, { type: 'call_busy', chatId: Number(chatId) });
    const call = {
      id: randomBytes(8).toString('hex'),
      chatId: Number(chatId),
      from: userId,
      to,
      video: Boolean(video),
      answeredAt: 0,
      fromWs: ws,
      toWs: null,
      timer: setTimeout(() => end(call, 'missed'), RING_MS),
    };
    call.timer.unref?.();
    calls.set(call.id, call);
    byUser.set(userId, call.id);
    byUser.set(to, call.id);
    deps.send(userId, { type: 'call_ringing', call: view(call) });
    deps.send(to, { type: 'call_incoming', call: view(call) });
    if (!deps.isWatching(to)) {
      deps.notify(to, {
        title: deps.userCard(userId).name,
        body: call.video ? '📹 Входящий видеозвонок' : '📞 Входящий звонок',
        tag: `call-${call.id}`,
        url: `/?chat=${call.chatId}`,
      });
    }
  }

  function handle(userId, msg, ws) {
    if (msg.type === 'call_invite') return invite(userId, msg, ws);
    const call = calls.get(String(msg.callId ?? ''));
    if (!call || (call.from !== userId && call.to !== userId)) return;
    switch (msg.type) {
      case 'call_accept':
        if (userId !== call.to || call.answeredAt) return;
        clearTimeout(call.timer);
        call.answeredAt = Date.now();
        call.toWs = ws;
        deps.send(call.from, { type: 'call_accepted', callId: call.id });
        // Other tabs of the callee stop ringing.
        deps.send(call.to, { type: 'call_answered_elsewhere', callId: call.id });
        break;
      case 'call_decline':
        if (userId === call.to && !call.answeredAt) end(call, 'declined');
        break;
      case 'call_hangup':
        end(call, call.answeredAt ? 'ended' : userId === call.from ? 'canceled' : 'declined');
        break;
      case 'call_failed':
        end(call, 'failed');
        break;
      case 'call_signal': {
        const data = msg.data;
        if (!data || JSON.stringify(data).length > MAX_SIGNAL) return;
        deps.send(other(call, userId), { type: 'call_signal', callId: call.id, data });
        break;
      }
    }
  }

  // The caller's tab, or the tab that picked up, disconnected: the call is over.
  function onSocketClosed(userId, ws) {
    const call = calls.get(byUser.get(userId));
    if (!call) return;
    if ((call.from === userId && call.fromWs === ws) || (call.to === userId && call.toWs === ws)) {
      end(call, call.answeredAt ? 'failed' : 'canceled');
    }
  }

  // Someone (re)connected while their phone is ringing: show the call again.
  function onConnect(userId) {
    const call = calls.get(byUser.get(userId));
    if (call && call.to === userId && !call.answeredAt) deps.send(userId, { type: 'call_incoming', call: view(call) });
  }

  function stop() {
    for (const call of calls.values()) clearTimeout(call.timer);
  }

  return { handle, onConnect, onSocketClosed, stop };
}
