import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// node:sqlite works without flags from Node 22.13 / 23.4 on; fail with a clear hint instead of a stack trace.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13) || (major === 23 && minor < 4)) {
  console.error(`Нужен Node.js 22.13 или новее (сейчас ${process.version}). Скачайте LTS: https://nodejs.org`);
  process.exit(1);
}

const { openDb } = await import('./db.js');
const { createServer } = await import('./app.js');

const PORT = Number(process.env.PORT) || 3000;
// HOST=127.0.0.1 keeps the server behind a reverse proxy (Caddy) on a VPS.
const HOST = process.env.HOST || undefined;
// fileURLToPath gives a proper path on Windows too (URL.pathname would be "/C:/…").
const DB_FILE = process.env.DB_FILE || fileURLToPath(new URL('../data/oleg.db', import.meta.url));

const db = openDb(DB_FILE);
// VOTE_MS shortens the initiation vote for local testing (default: 5 minutes).
const voteMs = Number(process.env.VOTE_MS) || undefined;
const { app, server, wss } = createServer(db, { voteMs });

// Serve the built web version (app/dist) from the same address, if it has been built:
// one port for everything — handy in Codespaces and on a single server.
const WEB_DIR = fileURLToPath(new URL('../../app/dist', import.meta.url));
if (existsSync(WEB_DIR)) {
  const { default: express } = await import('express');
  app.use(express.static(WEB_DIR));
}

function onListenError(err) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} занят: возможно, сервер Олега уже запущен в другом окне. Закройте его или задайте PORT.`);
  } else {
    console.error(err);
  }
  process.exit(1);
}
// The WebSocket server re-emits the HTTP server's errors, so both need the handler.
server.on('error', onListenError);
wss.on('error', onListenError);

server.listen(PORT, HOST, () => {
  console.log(`Oleg server: http://localhost:${PORT}`);
  if (existsSync(WEB_DIR)) console.log(`Web version: http://localhost:${PORT}/`);
});
