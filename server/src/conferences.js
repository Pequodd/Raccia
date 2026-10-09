// Conferences: audio/video calls for a whole chat (or a hand-picked group), with screen
// sharing. Small groups, so every participant connects to every other (mesh WebRTC);
// the server keeps who is in, relays signalling between pairs, and keeps a live card in
// the chat with a «Присоединиться» button.

import { randomBytes } from 'node:crypto';

export const MAX_PARTICIPANTS = 8;
const MAX_SIGNAL = 64 * 1024;

// Events about being in a room go only to the connection someone joined from (another
// open tab or phone of the same person must not react to them); invites go everywhere.
// deps: send(userId, event), sendWs(ws, event), isWatching(userId), notify(userId, payload), memberIds(chatId),
//       isMember(chatId, userId), userCard(userId), chatTitle(chatId, viewerId),
//       postConference(chatId, userId, conf) → message id, refreshCard(conf), finishCard(conf)
export function createConferences(deps) {
  const confs = new Map(); // id → { id, chatId, video, hostId, startedAt, messageId, people: Map<userId, { screen }> }
  const byUser = new Map(); // userId → conf id

  const people = (conf) => [...conf.people.entries()].map(([id, p]) => ({ ...deps.userCard(id), screen: p.screen }));
  const confOf = (userId) => confs.get(byUser.get(userId));
  const live = (id) => {
    const conf = confs.get(id);
    return conf ? { id: conf.id, active: true, video: conf.video, startedAt: conf.startedAt, people: people(conf) } : null;
  };

  function broadcastToConf(conf, event, except) {
    for (const [uid, p] of conf.people) if (uid !== except) deps.sendWs(p.ws, event);
  }
  const toSeat = (conf, userId, event) => {
    const p = conf.people.get(userId);
    if (p) deps.sendWs(p.ws, event);
  };

  function leave(userId, { quiet = false } = {}) {
    const conf = confs.get(byUser.get(userId));
    if (!conf) return;
    if (!quiet) toSeat(conf, userId, { type: 'conf_left', confId: conf.id });
    byUser.delete(userId);
    conf.people.delete(userId);
    broadcastToConf(conf, { type: 'conf_peer_left', confId: conf.id, userId });
    if (conf.people.size === 0) {
      confs.delete(conf.id);
      deps.finishCard(conf);
    } else {
      deps.refreshCard(conf);
    }
  }

  // ws: the connection this person joined from; when it closes, they leave.
  function join(userId, conf, ws) {
    // Still listed from a tab that is gone, or switching rooms: drop the old seat quietly
    // (telling this device «you left» would close the conference it is opening).
    if (byUser.has(userId)) leave(userId, { quiet: true });
    if (conf.people.size >= MAX_PARTICIPANTS) {
      return deps.sendWs(ws, { type: 'conf_error', error: `В конференции уже ${MAX_PARTICIPANTS} человек — больше не потянет` });
    }
    const peers = people(conf);
    conf.people.set(userId, { screen: false, ws });
    byUser.set(userId, conf.id);
    // The newcomer calls everyone already inside; they just answer.
    deps.sendWs(ws, {
      type: 'conf_joined',
      conf: { id: conf.id, chatId: conf.chatId, video: conf.video, title: deps.chatTitle(conf.chatId, userId) },
      peers,
    });
    broadcastToConf(conf, { type: 'conf_peer_joined', confId: conf.id, peer: { ...deps.userCard(userId), screen: false } }, userId);
    deps.refreshCard(conf);
  }

  function start(userId, { chatId, video }, ws) {
    chatId = Number(chatId);
    if (!deps.isMember(chatId, userId)) return deps.sendWs(ws, { type: 'conf_error', error: 'Чат не найден' });
    // One conference per chat: starting again just joins the running one.
    const running = [...confs.values()].find((c) => c.chatId === chatId);
    if (running) return join(userId, running, ws);
    const conf = {
      id: randomBytes(8).toString('hex'),
      chatId,
      video: Boolean(video),
      hostId: userId,
      startedAt: Date.now(),
      messageId: null,
      people: new Map(),
    };
    confs.set(conf.id, conf);
    join(userId, conf, ws);
    conf.messageId = deps.postConference(chatId, userId, conf);
    const host = deps.userCard(userId);
    for (const uid of deps.memberIds(chatId)) {
      if (uid === userId) continue;
      deps.send(uid, { type: 'conf_invite', conf: { id: conf.id, chatId, video: conf.video, title: deps.chatTitle(chatId, uid), host } });
      if (!deps.isWatching(uid)) {
        deps.notify(uid, {
          title: deps.chatTitle(chatId, uid),
          body: `${host.name} зовёт в ${conf.video ? 'видеоконференцию' : 'аудиоконференцию'}`,
          tag: `conf-${conf.id}`,
          url: `/?chat=${chatId}`,
        });
      }
    }
  }

  function handle(userId, msg, ws) {
    if (msg.type === 'conf_start') return start(userId, msg, ws);
    const conf = confs.get(String(msg.confId ?? ''));
    if (!conf) {
      if (msg.type === 'conf_join') deps.sendWs(ws, { type: 'conf_error', error: 'Конференция уже закончилась' });
      return;
    }
    switch (msg.type) {
      case 'conf_join':
        if (deps.isMember(conf.chatId, userId)) join(userId, conf, ws);
        break;
      case 'conf_leave':
        // Only the device that is in the room can take its seat away.
        if (conf.people.get(userId)?.ws === ws) leave(userId);
        break;
      case 'conf_signal': {
        const to = Number(msg.to);
        if (conf.people.get(userId)?.ws !== ws || !conf.people.has(to) || !msg.data) return;
        if (JSON.stringify(msg.data).length > MAX_SIGNAL) return;
        toSeat(conf, to, { type: 'conf_signal', confId: conf.id, from: userId, data: msg.data });
        break;
      }
      case 'conf_screen': {
        const me = conf.people.get(userId);
        if (!me || me.ws !== ws) return;
        me.screen = Boolean(msg.on);
        broadcastToConf(conf, { type: 'conf_screen', confId: conf.id, userId, on: me.screen }, userId);
        deps.refreshCard(conf);
        break;
      }
    }
  }

  // The tab or phone they joined from disconnected: leave, so others don't wait for a ghost.
  // (Another open tab of the same person does not keep them in.)
  function onSocketClosed(userId, ws) {
    if (confOf(userId)?.people.get(userId)?.ws === ws) leave(userId);
  }

  // The chat is being deleted: everyone out, no card to update.
  function endForChat(chatId) {
    for (const conf of [...confs.values()]) {
      if (conf.chatId !== chatId) continue;
      conf.messageId = null;
      for (const uid of [...conf.people.keys()]) leave(uid);
    }
  }

  return { handle, onSocketClosed, live, endForChat, MAX_PARTICIPANTS };
}
