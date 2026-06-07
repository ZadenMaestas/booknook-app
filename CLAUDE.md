# Booknook

Self-hosted digital library for books (EPUB/PDF) and comics (CBZ/CBR). Single-file server (`app.ts`) built on Hono + Bun with a Pug template frontend.

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (with `hono/bun` adapter)
- **Database**: SQLite via `bun:sqlite` (WAL mode)
- **Templates**: Pug (server-rendered, `views/`)
- **Auth**: Custom session middleware, bcrypt passwords, cookie-based sessions
- **AI plugin**: Google Gemini (`@google/generative-ai`)

## Development

```bash
bun run dev          # watch mode (auto-restart)
bun run start        # production
bun run typecheck    # tsc --noEmit
```

`DEV` is hardcoded to `false` in `app.ts:21` — set it to `true` locally for live-reload via `livereload.ts`.

## Project Layout

```
app.ts              # All routes (27KB — the entire server)
database.ts         # DB init, schema CREATE TABLE, admin user bootstrap
middleware/
  auth.ts           # requireAuth, requireAdmin, handleLogin, handleLogout
  session.ts        # Cookie session (booknook.sid, 7-day TTL, DB-backed)
  dev.ts            # Live-reload injection in dev mode
utils/
  bookUtils.ts      # EPUB metadata, Google Books lookup, ISBN resolution
  cbzUtils.ts       # CBZ/CBR page extraction (7z), ComicInfo.xml parsing
  convertUtils.ts   # PDF first-page → JPEG (pdftoppm via spawn)
  coverUtils.ts     # Cover fetch, cache, and shrink (ImageMagick)
  epubStream.ts     # EPUB zip streaming, spine parsing
  migrationRunner.ts# Schema migration system (auto-detects pre-existing state)
plugins/
  index.ts          # PluginRegistry — loads plugins/<name>/plugin.ts at startup
  ai-integration/   # Gemini AI plugin (counts toward /plugins/ai-integration/*)
  example/          # Skipped by loader (hardcoded exclusion)
views/              # Pug templates
public/             # Static assets + foliate-js (EPUB reader)
types/              # TypeScript type definitions
```

## Database Schema

Tables defined in `database.ts` (created on startup):

| Table | Key columns |
|---|---|
| `users` | id, username, password_hash, is_admin |
| `sessions` | id (TEXT), data (JSON), expires_at (epoch ms) |
| `books` | id, title, author, isbn, filePath, status |
| `comics` | id, title, series, issue, year, filePath, pageCount, status |
| `comic_progress` | user_id, comic_id, page (PK: both) |
| `reading_progress` | user_id, book_id, cfi, percentage (PK: both) |
| `api_keys` | id, name, key |
| `schema_migrations` | id, applied_at |

Migrations live in `utils/migrationRunner.ts` — add new ones to the `MIGRATIONS` array. They run automatically on startup and use `detect()` to handle pre-existing state.

## Authentication & API Keys

- **UI auth**: session cookie (`booknook.sid`) — use `requireAuth` / `requireAdmin` middleware
- **API auth**: Bearer token via `api_keys` table — use `requireApiKey()` in `app.ts`
- Admin user is bootstrapped from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars on first start

## Environment Variables

Required:
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
SESSION_SECRET=<random hex string>   # openssl rand -hex 32
```

Optional:
```
PORT=3001
GOOGLE_BOOKS_API_KEY=   # book metadata/cover lookup
GEMINI_API_KEY=          # AI integration plugin
DATA_DIR=                # custom SQLite path (used in Docker)
```

## Plugin System

Drop a `plugins/<name>/plugin.ts` (or `.js`) that exports `{ name, register(ctx) }`. The loader skips `example/`. Plugins get:
- `ctx.router` — a scoped Hono router, mounted at `/plugins/<name>`
- `ctx.db` — the SQLite database handle
- `ctx.render()` — Pug renderer with session/nav locals injected
- `ctx.addNavItem()`, `ctx.addStylesheet()`, `ctx.addScript()`
- `ctx.on(event, handler)` — event bus hooks (emitted from `app.ts` via `plugins.emit()`)

Static assets in `plugins/<name>/public/` are served at `/plugins/<name>/static/*`.

## Docker

```bash
docker compose up --build   # build and start
```

Volumes: `./data` (SQLite), `./books`, `./comics`, `./cache`.

System deps in the image: `poppler-utils` (PDF covers), `imagemagick` (cover resize), `7zip` (CBZ/CBR), `curl` (healthcheck).

## Key Invariants

- `DEV = false` must stay `false` in committed `app.ts` — it bypasses auth in dev mode
- Cover images are cached under `cache/covers/` — `coverId` is the book/comic DB id
- Comic pages are extracted on-demand via 7z (never stored); page count is cached in DB
- PDF cover extraction uses `pdftoppm` (poppler), not ImageMagick
- Session cleanup runs with 1% probability on each request (probabilistic GC)
