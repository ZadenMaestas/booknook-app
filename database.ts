import 'dotenv/config';
import { Database } from 'bun:sqlite';
import bcrypt from 'bcrypt';
import path from 'path';

const dbPath = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'booknook.db')
    : 'booknook.db';

const db = new Database(dbPath, { create: true });

// WAL mode: readers don't block writers and vice-versa, better for concurrent requests
db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA synchronous=NORMAL');   // safe with WAL, much faster than FULL
db.exec('PRAGMA busy_timeout=5000');    // wait up to 5s on lock instead of erroring
db.exec('PRAGMA cache_size=-16000');    // 16 MB page cache

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS books (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  author     TEXT,
  isbn       TEXT UNIQUE,
  filePath   TEXT UNIQUE,
  status     TEXT DEFAULT 'none',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS comics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  series     TEXT,
  issue      TEXT,
  year       INTEGER,
  filePath   TEXT UNIQUE,
  pageCount  INTEGER DEFAULT 0,
  status     TEXT DEFAULT 'none',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

try { db.prepare('ALTER TABLE comics ADD COLUMN year INTEGER').run(); } catch {}

db.prepare(`CREATE TABLE IF NOT EXISTS comic_progress (
  user_id    INTEGER NOT NULL,
  comic_id   INTEGER NOT NULL,
  page       INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, comic_id)
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS reading_progress (
  user_id    INTEGER NOT NULL,
  book_id    INTEGER NOT NULL,
  cfi        TEXT,
  percentage REAL DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, book_id)
)`).run();

const adminUser = process.env.ADMIN_USERNAME;
const adminPass = process.env.ADMIN_PASSWORD;
if (adminUser && adminPass) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(adminUser);
    if (!existing) {
        const hash = bcrypt.hashSync(adminPass, 10);
        db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)').run(adminUser, hash);
        console.log(`Admin user "${adminUser}" created`);
    }
}

export default db;
