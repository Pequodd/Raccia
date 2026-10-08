import { openDb } from './db.js';
import { createServer } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || new URL('../data/oleg.db', import.meta.url).pathname;

const db = openDb(DB_FILE);
// VOTE_MS shortens the initiation vote for local testing (default: 5 minutes).
const voteMs = Number(process.env.VOTE_MS) || undefined;
const { server } = createServer(db, { voteMs });

server.listen(PORT, () => {
  console.log(`Oleg server: http://localhost:${PORT}`);
});
