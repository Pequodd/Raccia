import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { hashPassword, verifyPassword, newToken } from './auth.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_PAGE = 100;
const MAX_NAME_LENGTH = 32;
const VOTE_MS = 5 * 60_000;

// Sticker ids a user may pick as an avatar (app/assets/stickers/webp).
export const AVATARS = [
  'attack', 'away', 'cool', 'cry', 'cry2', 'down', 'drink', 'drink2',
  'hello', 'idea', 'luv', 'q', 'sleep', 'smoke', 'work',
];
// Candidates and rejected users wear the default Oleg.
const DEFAULT_AVATAR = 'idea';

// Shown name: «Олег#N» until initiated, then the chosen name (or the login nick).
const NAME_SQL = `CASE WHEN u.status = 'initiated' THEN COALESCE(u.display_name, u.username) ELSE 'Олег#' || u.id END`;
const AVATAR_SQL = `CASE WHEN u.status = 'initiated' THEN u.avatar ELSE '${DEFAULT_AVATAR}' END`;
const USER_COLS = `u.id, u.username, ${NAME_SQL} AS name, ${AVATAR_SQL} AS avatar, u.status, u.is_admin`;

export function createServer(db, { voteMs = VOTE_MS } = {}) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // userId -> Set<WebSocket>
  const sockets = new Map();
  // candidateId -> timeout that closes the vote
  const voteTimers = new Map();

  const q = {
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare(`SELECT ${USER_COLS}, u.invited_by, u.vote_ends_at FROM users u WHERE u.id = ?`),
    insertUser: db.prepare(
      'INSERT INTO users (username, password_hash, created_at, status, invited_by, vote_ends_at, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    userByToken: db.prepare(
      `SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
    ),
    searchUsers: db.prepare(`
      SELECT ${USER_COLS} FROM users u
      WHERE (u.username LIKE ?1 ESCAPE '\\' OR ${NAME_SQL} LIKE ?1 ESCAPE '\\') AND u.id != ?2
      ORDER BY name LIMIT 20
    `),
    setProfile: db.prepare('UPDATE users SET display_name = ?, avatar = ? WHERE id = ?'),
    initiatedIds: db.prepare("SELECT id FROM users WHERE status = 'initiated'"),
    allIds: db.prepare('SELECT id FROM users'),
    candidates: db.prepare("SELECT id FROM users WHERE status = 'candidate'"),
    setStatus: db.prepare('UPDATE users SET status = ?, vote_ends_at = NULL WHERE id = ?'),

    insertInvite: db.prepare('INSERT INTO invites (code, created_by, created_at) VALUES (?, ?, ?)'),
    inviteByCode: db.prepare(
      `SELECT i.code, i.created_by, i.used_by, ${NAME_SQL} AS inviter FROM invites i JOIN users u ON u.id = i.created_by WHERE i.code = ?`
    ),
    useInvite: db.prepare('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL'),

    voteTally: db.prepare(`
      SELECT
        SUM(v.vote = 'for') AS yes,
        SUM(v.vote = 'against') AS no
      FROM votes v JOIN users u ON u.id = v.voter_id
      WHERE v.candidate_id = ? AND u.status = 'initiated'
    `),
    myVote: db.prepare('SELECT vote FROM votes WHERE candidate_id = ? AND voter_id = ?'),
    castVote: db.prepare(
      'INSERT INTO votes (candidate_id, voter_id, vote) VALUES (?1, ?2, ?3) ON CONFLICT (candidate_id, voter_id) DO UPDATE SET vote = ?3'
    ),
    clearVote: db.prepare('DELETE FROM votes WHERE candidate_id = ? AND voter_id = ?'),

    chatsForUser: db.prepare(`
      SELECT c.id, c.type, c.title, c.created_at, cm.last_read_id,
        (SELECT MAX(id) FROM messages m WHERE m.chat_id = c.id) AS last_message_id,
        (SELECT COUNT(*) FROM messages m
          WHERE m.chat_id = c.id AND m.id > cm.last_read_id AND m.user_id != cm.user_id AND m.kind = 'text') AS unread
      FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = ?
    `),
    chatForUser: db.prepare(`
      SELECT c.id, c.type, c.title, c.created_at, cm.last_read_id,
        (SELECT MAX(id) FROM messages m WHERE m.chat_id = c.id) AS last_message_id,
        (SELECT COUNT(*) FROM messages m
          WHERE m.chat_id = c.id AND m.id > cm.last_read_id AND m.user_id != cm.user_id AND m.kind = 'text') AS unread
      FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = ? AND c.id = ?
    `),
    members: db.prepare(`
      SELECT ${USER_COLS}, cm.last_read_id, cm.last_delivered_id
      FROM chat_members cm JOIN users u ON u.id = cm.user_id
      WHERE cm.chat_id = ? ORDER BY name
    `),
    isMember: db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'),
    chatByDirectKey: db.prepare('SELECT id FROM chats WHERE direct_key = ?'),
    insertChat: db.prepare('INSERT INTO chats (type, title, direct_key, created_at) VALUES (?, ?, ?, ?)'),
    insertMember: db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)'),
    messageById: db.prepare(`
      SELECT m.id, m.chat_id, m.user_id, m.kind, ${NAME_SQL} AS name, m.body, m.created_at
      FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?
    `),
    messagesPage: db.prepare(`
      SELECT m.id, m.chat_id, m.user_id, m.kind, ${NAME_SQL} AS name, m.body, m.created_at
      FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.chat_id = ? AND m.id < ?
      ORDER BY m.id DESC LIMIT ?
    `),
    insertMessage: db.prepare(
      'INSERT INTO messages (chat_id, user_id, body, created_at, kind) VALUES (?, ?, ?, ?, ?)'
    ),
    markRead: db.prepare(
      'UPDATE chat_members SET last_read_id = MAX(last_read_id, ?1), last_delivered_id = MAX(last_delivered_id, ?1) WHERE chat_id = ?2 AND user_id = ?3'
    ),
    markDelivered: db.prepare(
      'UPDATE chat_members SET last_delivered_id = ?1 WHERE chat_id = ?2 AND user_id = ?3 AND last_delivered_id < ?1'
    ),
    undelivered: db.prepare(`
      SELECT cm.chat_id, (SELECT MAX(id) FROM messages m WHERE m.chat_id = cm.chat_id) AS last_id
      FROM chat_members cm WHERE cm.user_id = ?
    `),
    contacts: db.prepare(`
      SELECT DISTINCT b.user_id AS id FROM chat_members a
      JOIN chat_members b ON a.chat_id = b.chat_id
      WHERE a.user_id = ? AND b.user_id != ?
    `),
  };

  const isOnline = (userId) => sockets.has(userId);

  function userView(row) {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      avatar: row.avatar ?? null,
      status: row.status,
      online: isOnline(row.id),
    };
  }

  function meView(row) {
    return { ...userView(row), isAdmin: Boolean(row.is_admin) };
  }

  function messageView(row) {
    return {
      id: row.id,
      chatId: row.chat_id,
      userId: row.user_id,
      kind: row.kind,
      name: row.name,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  function chatView(row, viewerId) {
    const members = q.members.all(row.id).map((m) => ({
      ...userView(m),
      lastReadId: m.last_read_id,
      lastDeliveredId: m.last_delivered_id,
    }));
    let title = row.title;
    if (row.type === 'direct') {
      const other = members.find((m) => m.id !== viewerId);
      title = other ? other.name : 'Избранное';
    }
    const last = row.last_message_id ? q.messageById.get(row.last_message_id) : null;
    return {
      id: row.id,
      type: row.type,
      title,
      members,
      lastMessage: last ? messageView(last) : null,
      unread: row.unread,
      createdAt: row.created_at,
    };
  }

  function getChat(chatId, userId) {
    const row = q.chatForUser.get(userId, chatId);
    return row ? chatView(row, userId) : null;
  }

  function send(userId, event) {
    const set = sockets.get(userId);
    if (!set) return;
    const data = JSON.stringify(event);
    for (const ws of set) if (ws.readyState === ws.OPEN) ws.send(data);
  }

  function broadcast(makeEvent) {
    for (const userId of sockets.keys()) send(userId, makeEvent(userId));
  }

  function memberIds(chatId) {
    return q.members.all(chatId).map((m) => m.id);
  }

  // Users who share at least one chat with userId — they care about its presence and name.
  function contactsOf(userId) {
    return q.contacts.all(userId, userId).map((r) => r.id);
  }

  function markDelivered(chatId, userId, messageId) {
    const { changes } = q.markDelivered.run(messageId, chatId, userId);
    if (!changes) return;
    for (const uid of memberIds(chatId)) send(uid, { type: 'delivered', chatId, userId, messageId });
  }

  function postMessage(chatId, userId, body, kind = 'text') {
    const id = Number(q.insertMessage.run(chatId, userId, body, Date.now(), kind).lastInsertRowid);
    if (kind === 'text') q.markRead.run(id, chatId, userId);
    const message = messageView(q.messageById.get(id));
    const members = memberIds(chatId);
    for (const uid of members) send(uid, { type: 'message', message });
    for (const uid of members) if (uid !== userId && isOnline(uid)) markDelivered(chatId, uid, id);
    return message;
  }

  function openDirectChat(userId, otherId) {
    const [a, b] = [userId, otherId].sort((x, y) => x - y);
    const key = `${a}:${b}`;
    let chatId = q.chatByDirectKey.get(key)?.id;
    let created = false;
    if (!chatId) {
      chatId = Number(q.insertChat.run('direct', null, key, Date.now()).lastInsertRowid);
      q.insertMember.run(chatId, a);
      q.insertMember.run(chatId, b);
      created = true;
    }
    return { chatId, created };
  }

  function issueSession(userId) {
    const token = newToken();
    q.insertSession.run(token, userId, Date.now());
    return { token, user: meView(q.userById.get(userId)) };
  }

  // --- Initiation vote ---

  function voteView(candidateId, viewerId) {
    const c = q.userById.get(candidateId);
    if (!c || c.status !== 'candidate') return null;
    const inviter = c.invited_by ? q.userById.get(c.invited_by) : null;
    const tally = q.voteTally.get(candidateId);
    const yes = tally.yes ?? 0;
    const no = tally.no ?? 0;
    const voters = q.initiatedIds.all().length;
    const viewer = q.userById.get(viewerId);
    return {
      candidate: userView(c),
      invitedBy: inviter ? userView(inviter) : null,
      startedAt: c.vote_ends_at - voteMs,
      endsAt: c.vote_ends_at,
      yes,
      no,
      thinking: Math.max(0, voters - yes - no),
      myVote: q.myVote.get(candidateId, viewerId)?.vote ?? null,
      canVote: viewer?.status === 'initiated',
    };
  }

  function broadcastVote(candidateId) {
    broadcast((uid) => {
      const vote = voteView(candidateId, uid);
      return vote ? { type: 'vote', vote } : { type: 'vote_closed', candidateId };
    });
  }

  function scheduleVote(candidateId, endsAt) {
    clearTimeout(voteTimers.get(candidateId));
    const timer = setTimeout(() => closeVote(candidateId), Math.max(0, endsAt - Date.now()));
    timer.unref?.();
    voteTimers.set(candidateId, timer);
  }

  // Majority of cast votes decides; a tie (0:0 included) lets the newcomer in.
  function closeVote(candidateId) {
    voteTimers.delete(candidateId);
    const c = q.userById.get(candidateId);
    if (!c || c.status !== 'candidate') return;
    const { yes, no } = q.voteTally.get(candidateId);
    const accepted = (yes ?? 0) >= (no ?? 0);
    q.setStatus.run(accepted ? 'initiated' : 'rejected', candidateId);
    const user = userView(q.userById.get(candidateId));
    broadcast(() => ({ type: 'vote_result', candidateId, accepted, yes: yes ?? 0, no: no ?? 0, user }));
    send(candidateId, { type: 'me', user: meView(q.userById.get(candidateId)) });
  }

  // Votes survive a restart: reschedule the ones still running.
  for (const { id } of q.candidates.all()) {
    const c = q.userById.get(id);
    scheduleVote(id, c.vote_ends_at ?? Date.now());
  }

  // --- HTTP ---

  app.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Who sent this invite — shown on the registration screen.
  app.get('/api/invites/:code', (req, res) => {
    const invite = q.inviteByCode.get(String(req.params.code));
    if (!invite || invite.used_by) return res.status(404).json({ error: 'Инвайт недействителен или уже использован' });
    res.json({ invitedBy: invite.inviter });
  });

  app.post('/api/register', async (req, res) => {
    const { username, password, invite: code } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Ник: 3–32 символа, латиница, цифры и _' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
    }

    // The very first user founds Oleg: no invite, initiated, super-admin.
    const founding = q.userCount.get().n === 0;
    const invite = founding ? null : q.inviteByCode.get(String(code ?? ''));
    if (!founding && (!invite || invite.used_by)) {
      return res.status(403).json({ error: 'Нужен действующий инвайт' });
    }
    if (q.userByName.get(username)) {
      return res.status(409).json({ error: 'Ник уже занят' });
    }

    const hash = await hashPassword(password);
    const now = Date.now();
    const endsAt = founding ? null : now + voteMs;
    const userId = Number(
      q.insertUser.run(
        username,
        hash,
        now,
        founding ? 'initiated' : 'candidate',
        invite?.created_by ?? null,
        endsAt,
        founding ? 1 : 0
      ).lastInsertRowid
    );

    if (invite) {
      q.useInvite.run(userId, now, invite.code);
      // The newcomer can write straight away: open a chat with whoever invited them.
      const { chatId } = openDirectChat(invite.created_by, userId);
      postMessage(chatId, userId, `Олег#${userId} подключился по инвайту ${invite.inviter}. Идёт голосование.`, 'service');
      send(invite.created_by, { type: 'chat', chat: getChat(chatId, invite.created_by) });
      scheduleVote(userId, endsAt);
      broadcastVote(userId);
    }

    res.status(201).json(issueSession(userId));
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    const user = typeof username === 'string' ? q.userByName.get(username) : null;
    if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверный ник или пароль' });
    }
    res.json(issueSession(user.id));
  });

  function requireAuth(req, res, next) {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = token ? q.userByToken.get(token) : null;
    if (!user) return res.status(401).json({ error: 'Требуется вход' });
    req.user = user;
    req.token = token;
    next();
  }

  app.post('/api/logout', requireAuth, (req, res) => {
    q.deleteSession.run(req.token);
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ user: meView(req.user) }));

  // Name and avatar: only for the initiated.
  app.post('/api/me', requireAuth, (req, res) => {
    if (req.user.status !== 'initiated') {
      return res.status(403).json({ error: 'Имя и аватар меняют только посвящённые' });
    }
    const current = q.userById.get(req.user.id);
    let name = req.body?.name === undefined ? current.name : req.body.name;
    if (typeof name !== 'string' || !(name = name.trim()) || name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ error: `Имя: от 1 до ${MAX_NAME_LENGTH} символов` });
    }
    if (/^олег\s*#\s*\d+/i.test(name)) return res.status(400).json({ error: 'Это имя для непосвящённых' });
    const avatar = req.body?.avatar === undefined ? current.avatar : req.body.avatar;
    if (avatar !== null && !AVATARS.includes(avatar)) return res.status(400).json({ error: 'Нет такого аватара' });

    q.setProfile.run(name === current.username ? null : name, avatar, req.user.id);
    const me = meView(q.userById.get(req.user.id));
    const user = userView(q.userById.get(req.user.id));
    send(req.user.id, { type: 'me', user: me });
    for (const id of contactsOf(req.user.id)) send(id, { type: 'user', user });
    res.json({ user: me });
  });

  app.post('/api/invites', requireAuth, (req, res) => {
    const code = newToken().slice(0, 10);
    q.insertInvite.run(code, req.user.id, Date.now());
    res.status(201).json({ code });
  });

  app.get('/api/votes', requireAuth, (req, res) => {
    const votes = q.candidates.all().map(({ id }) => voteView(id, req.user.id)).filter(Boolean);
    res.json({ votes });
  });

  // vote: 'for' | 'against' | null (changed my mind) — until the timer runs out.
  app.post('/api/votes/:id', requireAuth, (req, res) => {
    const candidateId = Number(req.params.id);
    const c = Number.isInteger(candidateId) ? q.userById.get(candidateId) : null;
    if (!c || c.status !== 'candidate') return res.status(404).json({ error: 'Голосование закончилось' });
    if (req.user.status !== 'initiated') return res.status(403).json({ error: 'Голосуют только посвящённые' });
    const vote = req.body?.vote ?? null;
    if (vote !== null && vote !== 'for' && vote !== 'against') {
      return res.status(400).json({ error: 'vote: for, against или null' });
    }
    if (vote) q.castVote.run(candidateId, req.user.id, vote);
    else q.clearVote.run(candidateId, req.user.id);
    broadcastVote(candidateId);
    res.json({ vote: voteView(candidateId, req.user.id) });
  });

  app.get('/api/users', requireAuth, (req, res) => {
    const term = String(req.query.q ?? '').replace(/[\\%_]/g, (c) => '\\' + c);
    const users = q.searchUsers.all(`%${term}%`, req.user.id);
    res.json({ users: users.map(userView) });
  });

  app.get('/api/chats', requireAuth, (req, res) => {
    const chats = q.chatsForUser
      .all(req.user.id)
      .map((row) => chatView(row, req.user.id))
      .sort((a, b) => (b.lastMessage?.createdAt ?? b.createdAt) - (a.lastMessage?.createdAt ?? a.createdAt));
    res.json({ chats });
  });

  app.post('/api/chats/direct', requireAuth, (req, res) => {
    const otherId = Number(req.body?.userId);
    if (!Number.isInteger(otherId) || !q.userById.get(otherId)) {
      return res.status(404).json({ error: 'Абонент не найден' });
    }
    const { chatId, created } = openDirectChat(req.user.id, otherId);
    if (created && otherId !== req.user.id) send(otherId, { type: 'chat', chat: getChat(chatId, otherId) });
    res.json({ chat: getChat(chatId, req.user.id) });
  });

  app.post('/api/chats/group', requireAuth, (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title || title.length > 100) return res.status(400).json({ error: 'Укажите название (до 100 символов)' });
    const ids = Array.isArray(req.body?.memberIds) ? req.body.memberIds.map(Number) : [];
    const valid = [...new Set(ids)].filter((id) => Number.isInteger(id) && q.userById.get(id));
    const chatId = Number(q.insertChat.run('group', title, null, Date.now()).lastInsertRowid);
    for (const id of new Set([req.user.id, ...valid])) q.insertMember.run(chatId, id);
    for (const id of valid) if (id !== req.user.id) send(id, { type: 'chat', chat: getChat(chatId, id) });
    res.status(201).json({ chat: getChat(chatId, req.user.id) });
  });

  function requireMember(req, res, next) {
    const chatId = Number(req.params.id);
    if (!Number.isInteger(chatId) || !q.isMember.get(chatId, req.user.id)) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    req.chatId = chatId;
    next();
  }

  app.get('/api/chats/:id/messages', requireAuth, requireMember, (req, res) => {
    const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), MAX_PAGE);
    const rows = q.messagesPage.all(req.chatId, before, limit + 1);
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse().map(messageView);
    res.json({ messages, hasMore });
  });

  app.post('/api/chats/:id/messages', requireAuth, requireMember, (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ error: 'Пустое сообщение' });
    if (body.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ error: 'Слишком длинное сообщение' });
    res.status(201).json({ message: postMessage(req.chatId, req.user.id, body) });
  });

  app.post('/api/chats/:id/read', requireAuth, requireMember, (req, res) => {
    const messageId = Number(req.body?.messageId);
    if (!Number.isInteger(messageId)) return res.status(400).json({ error: 'messageId обязателен' });
    q.markRead.run(messageId, req.chatId, req.user.id);
    for (const uid of memberIds(req.chatId)) {
      send(uid, { type: 'read', chatId: req.chatId, userId: req.user.id, messageId });
    }
    res.json({ ok: true });
  });

  // --- WebSocket ---

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const user = q.userByToken.get(url.searchParams.get('token') ?? '');
    if (!user) {
      ws.close(4401, 'unauthorized');
      return;
    }

    const wasOnline = isOnline(user.id);
    if (!sockets.has(user.id)) sockets.set(user.id, new Set());
    sockets.get(user.id).add(ws);
    if (!wasOnline) {
      for (const id of contactsOf(user.id)) send(id, { type: 'presence', userId: user.id, online: true });
    }

    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg?.type === 'typing') {
        const chatId = Number(msg.chatId);
        if (!q.isMember.get(chatId, user.id)) return;
        const name = q.userById.get(user.id).name;
        for (const uid of memberIds(chatId)) {
          if (uid !== user.id) send(uid, { type: 'typing', chatId, userId: user.id, name });
        }
      }
    });

    ws.on('close', () => {
      const set = sockets.get(user.id);
      set?.delete(ws);
      if (set && set.size === 0) {
        sockets.delete(user.id);
        for (const id of contactsOf(user.id)) send(id, { type: 'presence', userId: user.id, online: false });
      }
    });

    ws.send(JSON.stringify({ type: 'ready', user: meView(user) }));

    // Everything sent while this user was offline is delivered now.
    for (const row of q.undelivered.all(user.id)) {
      if (row.last_id) markDelivered(row.chat_id, user.id, row.last_id);
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);
  server.on('close', () => {
    clearInterval(heartbeat);
    for (const timer of voteTimers.values()) clearTimeout(timer);
  });

  return { app, server, wss };
}
