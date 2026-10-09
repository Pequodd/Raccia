import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id         INTEGER PRIMARY KEY,
      type       TEXT NOT NULL CHECK (type IN ('direct', 'group')),
      title      TEXT,
      direct_key TEXT UNIQUE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_id INTEGER NOT NULL DEFAULT 0,
      last_delivered_id INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (chat_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS chat_members_user ON chat_members(user_id);

    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY,
      chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
  `);
  // Columns added after the first release.
  addColumn(db, 'chat_members', 'last_delivered_id', 'INTEGER NOT NULL DEFAULT 0');
  // Initiation: 'candidate' until the vote ends, then 'initiated' or (forever) 'rejected'.
  // Users created before initiation existed count as initiated.
  addColumn(db, 'users', 'status', "TEXT NOT NULL DEFAULT 'initiated'");
  addColumn(db, 'users', 'display_name', 'TEXT');
  addColumn(db, 'users', 'avatar', 'TEXT');
  addColumn(db, 'users', 'invited_by', 'INTEGER REFERENCES users(id)');
  addColumn(db, 'users', 'vote_ends_at', 'INTEGER');
  addColumn(db, 'users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(db, 'messages', 'kind', "TEXT NOT NULL DEFAULT 'text'");
  addColumn(db, 'messages', 'media', 'TEXT');
  addColumn(db, 'messages', 'forwarded_from', 'TEXT'); // shown name of the original author // JSON: { file, width, height, duration, size } for photo/video/voice/circle
  addColumn(db, 'users', 'bio', 'TEXT');
  addColumn(db, 'users', 'photo', 'TEXT'); // file name in the uploads dir; avatar = 'photo' shows it
  addColumn(db, 'users', 'onboarded', 'INTEGER NOT NULL DEFAULT 0');

  db.exec(`
    CREATE TABLE IF NOT EXISTS invites (
      code       TEXT PRIMARY KEY,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      used_by    INTEGER REFERENCES users(id),
      used_at    INTEGER
    );

    CREATE TABLE IF NOT EXISTS votes (
      candidate_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      voter_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vote         TEXT NOT NULL CHECK (vote IN ('for', 'against')),
      PRIMARY KEY (candidate_id, voter_id)
    );

    -- Web Push subscriptions: one per browser / installed PWA.
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);

    -- «Сходка»: bars the super-admin keeps, meetups posted into chats, and who is going.
    CREATE TABLE IF NOT EXISTS bars (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      address    TEXT,
      phone      TEXT,
      map_url    TEXT,
      note       TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetups (
      id         INTEGER PRIMARY KEY,
      chat_id    INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE,
      bar_id     INTEGER REFERENCES bars(id) ON DELETE SET NULL,
      place      TEXT NOT NULL, -- JSON copy of the place, so a deleted bar keeps old meetups readable
      starts_at  INTEGER NOT NULL,
      created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meetup_answers (
      meetup_id INTEGER NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answer    TEXT NOT NULL CHECK (answer IN ('yes', 'no')),
      PRIMARY KEY (meetup_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
