import { openDb } from './db.js';
import { createServer } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || new URL('../data/oleg.db', import.meta.url).pathname;

const db = openDb(DB_FILE);
const { server } = createServer(db);

server.listen(PORT, () => {
  console.log(`Oleg server: http://localhost:${PORT}`);
});
