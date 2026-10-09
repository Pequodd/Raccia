// Conferences: audio/video calls for a whole chat (or a hand-picked group), with screen
// sharing. Small groups, so every participant connects to every other (mesh WebRTC);
// the server keeps who is in, relays signalling between pairs, and keeps a live card in
// the chat with a «Присоединиться» button.

import { randomBytes } from 'node:crypto';

export const MAX_PARTICIPANTS = 8;
const MAX_SIGNAL = 64 * 1024;

// deps: send(userId, event), isWatching(userId), notify(userId, payload), memberIds(chatId),
//       isMember(chatId, userId), userCard(userId), chatTitle(chatId, viewerId),
//       postConference(chatId, userId, conf) → message id, refreshCard(conf), finishCard(conf)
export function createConferences(deps) {
  const confs = new Map(); // id → { id, chatId, video, hostId, startedAt, messageId, people: Map<userId, { screen }> }
  const byUser = new Map(); // userId → conf id

  const people = (conf) => [...conf.people.entries()].map(([id, p]) => ({ ...deps.userCard(id), screen: p.screen }));
  const live = (id) => {
    const conf = confs.get(id);
    return conf ? { id: conf.id, active: true, video: conf.video, startedAt: conf.startedAt, people: people(conf) } : null;
  };

  function broadcastToConf(conf, event, except) {
    for (const uid of conf.people.keys()) if (uid !== except) deps.send(uid, event);
  }

  function leave(userId) {
    const conf = confs.get(byUser.get(userId));
    if (!conf) return;
    byUser.delete(userId);
    conf.people.delete(userId);
    broadcastToConf(conf, { type: 'conf_peer_left', confId: conf.id, userId });
    deps.send(userId, { type: 'conf_left', confId: conf.id });
    if (conf.people.size === 0) {
      confs.delete(conf.id);
      deps.finishCard(conf);
    } else {
      deps.refreshCard(conf);
    }
  }

  function join(userId, conf) {
    if (byUser.get(userId) === conf.id) return;
    if (byUser.has(userId)) leave(userId);
    if (conf.people.size >= MAX_PARTICIPANTS) {
      return deps.send(userId, { type: 'conf_error', error: `В конференции уже ${MAX_PARTICIPANTS} человек — больше не потянет` });
    }
    const peers = people(conf);
    conf.people.set(userId, { screen: false });
    byUser.set(userId, conf.id);
    // The newcomer calls everyone already inside; they just answer.
    deps.send(userId, {
      type: 'conf_joined',
      conf: { id: conf.id, chatId: conf.chatId, video: conf.video, title: deps.chatTitle(conf.chatId, userId) },
      peers,
    });
    broadcastToConf(conf, { type: 'conf_peer_joined', confId: conf.id, peer: { ...deps.userCard(userId), screen: false } }, userId);
    deps.refreshCard(conf);
  }

  function start(userId, { chatId, video }) {
    chatId = Number(chatId);
    if (!deps.isMember(chatId, userId)) return deps.send(userId, { type: 'conf_error', error: 'Чат не найден' });
    // One conference per chat: starting again just joins the running one.
    const running = [...confs.values()].find((c) => c.chatId === chatId);
    if (running) return join(userId, running);
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
    join(userId, conf);
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

  function handle(userId, msg) {
    if (msg.type === 'conf_start') return start(userId, msg);
    const conf = confs.get(String(msg.confId ?? ''));
    if (!conf) {
      if (msg.type === 'conf_join') deps.send(userId, { type: 'conf_error', error: 'Конференция уже закончилась' });
      return;
    }
    switch (msg.type) {
      case 'conf_join':
        if (deps.isMember(conf.chatId, userId)) join(userId, conf);
        break;
      case 'conf_leave':
        if (conf.people.has(userId)) leave(userId);
        break;
      case 'conf_signal': {
        const to = Number(msg.to);
        if (!conf.people.has(userId) || !conf.people.has(to) || !msg.data) return;
        if (JSON.stringify(msg.data).length > MAX_SIGNAL) return;
        deps.send(to, { type: 'conf_signal', confId: conf.id, from: userId, data: msg.data });
        break;
      }
      case 'conf_screen': {
        const me = conf.people.get(userId);
        if (!me) return;
        me.screen = Boolean(msg.on);
        broadcastToConf(conf, { type: 'conf_screen', confId: conf.id, userId, on: me.screen }, userId);
        deps.refreshCard(conf);
        break;
      }
    }
  }

  // Lost every connection (closed the app): leave, so others don't wait for a ghost.
  function onOffline(userId) {
    leave(userId);
  }

  return { handle, onOffline, live, MAX_PARTICIPANTS };
}
