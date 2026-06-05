# Database Schema

Booknook uses a single SQLite file (`booknook.db`) managed by `bun:sqlite`. All tables are created with `CREATE TABLE IF NOT EXISTS`, so the schema is applied automatically on first run and is safe to re-run on restart.

## `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Passwords are hashed with bcrypt (cost 10). `is_admin = 1` grants access to `/admin/*` routes.

## `books`

```sql
CREATE TABLE IF NOT EXISTS books (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    author     TEXT,
    isbn       TEXT UNIQUE,
    filePath   TEXT UNIQUE,
    status     TEXT DEFAULT 'none',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

`status` is one of `none`, `want`, `reading`, `read`.

## `reading_progress`

```sql
CREATE TABLE IF NOT EXISTS reading_progress (
    user_id    INTEGER NOT NULL,
    book_id    INTEGER NOT NULL,
    cfi        TEXT,
    percentage REAL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, book_id)
);
```

`cfi` is an EPUB CFI string used by foliate-js to restore the exact reading position.

## `comics`

```sql
CREATE TABLE IF NOT EXISTS comics (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    series     TEXT,
    issue      TEXT,
    filePath   TEXT UNIQUE,
    pageCount  INTEGER DEFAULT 0,
    status     TEXT DEFAULT 'none',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

`series` and `issue` are populated from `ComicInfo.xml` when present.

## `comic_progress`

```sql
CREATE TABLE IF NOT EXISTS comic_progress (
    user_id    INTEGER NOT NULL,
    comic_id   INTEGER NOT NULL,
    page       INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, comic_id)
);
```

## `sessions`

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
```

Used by the session middleware to persist login state across restarts.

## Plugin tables

Plugins create their own tables using `CREATE TABLE IF NOT EXISTS` inside their `register()` function. By convention, table names are prefixed with the plugin name (e.g. `ai_integration`, `myplugin_items`).
