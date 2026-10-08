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
  `);
  return db;
}

function addColumn(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
