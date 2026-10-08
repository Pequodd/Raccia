import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';
import { hashPassword, verifyPassword, newToken } from './auth.js';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_PAGE = 100;

export function createServer(db) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // userId -> Set<WebSocket>
  const sockets = new Map();

  const q = {
    userByName: db.prepare('SELECT * FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    userByToken: db.prepare(
      'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
    ),
    searchUsers: db.prepare(
      "SELECT id, username FROM users WHERE username LIKE ? ESCAPE '\\' AND id != ? ORDER BY username LIMIT 20"
    ),
    chatsForUser: db.prepare(`
      SELECT c.id, c.type, c.title, c.created_at, cm.last_read_id,
        (SELECT MAX(id) FROM messages m WHERE m.chat_id = c.id) AS last_message_id,
        (SELECT COUNT(*) FROM messages m
          WHERE m.chat_id = c.id AND m.id > cm.last_read_id AND m.user_id != cm.user_id) AS unread
      FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = ?
    `),
    chatForUser: db.prepare(`
      SELECT c.id, c.type, c.title, c.created_at, cm.last_read_id,
        (SELECT MAX(id) FROM messages m WHERE m.chat_id = c.id) AS last_message_id,
        (SELECT COUNT(*) FROM messages m
          WHERE m.chat_id = c.id AND m.id > cm.last_read_id AND m.user_id != cm.user_id) AS unread
      FROM chats c JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = ? AND c.id = ?
    `),
    members: db.prepare(
      'SELECT u.id, u.username, cm.last_read_id FROM chat_members cm JOIN users u ON u.id = cm.user_id WHERE cm.chat_id = ? ORDER BY u.username'
    ),
    isMember: db.prepare('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?'),
    chatByDirectKey: db.prepare('SELECT id FROM chats WHERE direct_key = ?'),
    insertChat: db.prepare('INSERT INTO chats (type, title, direct_key, created_at) VALUES (?, ?, ?, ?)'),
    insertMember: db.prepare('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)'),
    messageById: db.prepare(
      'SELECT m.id, m.chat_id, m.user_id, u.username, m.body, m.created_at FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?'
    ),
    messagesPage: db.prepare(`
      SELECT m.id, m.chat_id, m.user_id, u.username, m.body, m.created_at
      FROM messages m JOIN users u ON u.id = m.user_id
      WHERE m.chat_id = ? AND m.id < ?
      ORDER BY m.id DESC LIMIT ?
    `),
    insertMessage: db.prepare('INSERT INTO messages (chat_id, user_id, body, created_at) VALUES (?, ?, ?, ?)'),
    markRead: db.prepare(
      'UPDATE chat_members SET last_read_id = MAX(last_read_id, ?) WHERE chat_id = ? AND user_id = ?'
    ),
  };

  const isOnline = (userId) => sockets.has(userId);

  function messageView(row) {
    return {
      id: row.id,
      chatId: row.chat_id,
      userId: row.user_id,
      username: row.username,
      body: row.body,
      createdAt: row.created_at,
    };
  }

  function chatView(row, viewerId) {
    const members = q.members.all(row.id).map((m) => ({
      id: m.id,
      username: m.username,
      online: isOnline(m.id),
      lastReadId: m.last_read_id,
    }));
    let title = row.title;
    if (row.type === 'direct') {
      const other = members.find((m) => m.id !== viewerId);
      title = other ? other.username : 'Избранное';
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

  function memberIds(chatId) {
    return q.members.all(chatId).map((m) => m.id);
  }

  // Users who share at least one chat with userId — they care about its presence.
  function contactsOf(userId) {
    const rows = db
      .prepare(
        `SELECT DISTINCT b.user_id AS id FROM chat_members a
         JOIN chat_members b ON a.chat_id = b.chat_id
         WHERE a.user_id = ? AND b.user_id != ?`
      )
      .all(userId, userId);
    return rows.map((r) => r.id);
  }

  function issueSession(user) {
    const token = newToken();
    q.insertSession.run(token, user.id, Date.now());
    return { token, user: { id: user.id, username: user.username } };
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

  app.post('/api/register', async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Имя: 3–32 символа, латиница, цифры и _' });
    }
    if (typeof password !== 'string' || password.length < 6 || password.length > 200) {
      return res.status(400).json({ error: 'Пароль: минимум 6 символов' });
    }
    if (q.userByName.get(username)) {
      return res.status(409).json({ error: 'Имя уже занято' });
    }
    const hash = await hashPassword(password);
    const { lastInsertRowid } = q.insertUser.run(username, hash, Date.now());
    res.status(201).json(issueSession({ id: Number(lastInsertRowid), username }));
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body ?? {};
    const user = typeof username === 'string' ? q.userByName.get(username) : null;
    if (!user || typeof password !== 'string' || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Неверное имя или пароль' });
    }
    res.json(issueSession(user));
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

  app.get('/api/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/users', requireAuth, (req, res) => {
    const term = String(req.query.q ?? '').replace(/[\\%_]/g, (c) => '\\' + c);
    const users = q.searchUsers.all(`%${term}%`, req.user.id);
    res.json({ users: users.map((u) => ({ ...u, online: isOnline(u.id) })) });
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
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    const [a, b] = [req.user.id, otherId].sort((x, y) => x - y);
    const key = `${a}:${b}`;
    let chatId = q.chatByDirectKey.get(key)?.id;
    if (!chatId) {
      chatId = Number(q.insertChat.run('direct', null, key, Date.now()).lastInsertRowid);
      q.insertMember.run(chatId, a);
      q.insertMember.run(chatId, b);
      if (otherId !== req.user.id) send(otherId, { type: 'chat', chat: getChat(chatId, otherId) });
    }
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
    const id = Number(q.insertMessage.run(req.chatId, req.user.id, body, Date.now()).lastInsertRowid);
    q.markRead.run(id, req.chatId, req.user.id);
    const message = messageView(q.messageById.get(id));
    for (const uid of memberIds(req.chatId)) send(uid, { type: 'message', message });
    res.status(201).json({ message });
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
        for (const uid of memberIds(chatId)) {
          if (uid !== user.id) send(uid, { type: 'typing', chatId, userId: user.id, username: user.username });
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

    ws.send(JSON.stringify({ type: 'ready', user }));
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
  server.on('close', () => clearInterval(heartbeat));

  return { app, server, wss };
}
