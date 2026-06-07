# Booknook

Self-hosted digital library for books (EPUB/PDF) and comics (CBZ/CBR). Single-file server (`app.ts`) built on Hono + Bun with a Pug template frontend.

@styles.md

## Tech Stack

- **Runtime**: Bun
- **Framework**: Hono (with `hono/bun` adapter)
- **Database**: SQLite via Sequelize ORM (`database.ts` — models, associations, bootstrap)
- **Templates**: Pug (server-rendered, `views/`)
- **Auth**: Custom session middleware, bcrypt passwords, cookie-based sessions
- **AI plugin**: Google Gemini (`@google/generative-ai`)

## Development

```bash
bun run dev          # watch mode (auto-restart)
bun run start        # production
bun run typecheck    # tsc --noEmit
```

## Project Layout

```
app.ts              # All routes (~26KB — the entire server)
database.ts         # Sequelize init, model definitions, admin user bootstrap
livereload.ts       # Live-reload server (dev only)
playwright.config.ts
middleware/
  auth.ts           # requireAuth, requireAdmin, handleLogin, handleLogout
  session.ts        # Cookie session (booknook.sid, 7-day TTL, DB-backed)
bookUtils.ts        # EPUB metadata, Google Books lookup, ISBN resolution
cbzUtils.ts         # CBZ/CBR page extraction (7z), ComicInfo.xml parsing
convertUtils.ts     # PDF first-page → JPEG (pdftoppm via spawn)
coverUtils.ts       # Cover fetch, cache, and shrink (ImageMagick)
epubStream.ts       # EPUB zip streaming, spine parsing
migrationRunner.ts  # Schema migration system (auto-detects pre-existing state)
plugins/
  index.ts          # PluginRegistry — loads plugins/<name>/plugin.ts at startup
  ai-integration/   # Gemini AI plugin (counts toward /plugins/ai-integration/*)
  example/          # Skipped by loader (hardcoded exclusion)
views/
  layout.pug        # Base layout (sidebar, nav, theme toggle)
  index.pug         # Book library
  reader.pug        # EPUB/PDF reader (foliate-js)
  comics.pug        # Comics library (series cards + standalone)
  series.pug        # Series detail (all issues for one series)
  comic-reader.pug  # CBZ/CBR reader
  library.pug       # Unified library view
  settings.pug      # User settings + admin panel
  admin-users.pug   # Admin user management
  login.pug         # Login page
public/             # Static assets + foliate-js (EPUB reader)
types/              # TypeScript type definitions
tests/              # Playwright tests
```

## Database Schema

Models defined in `database.ts` via Sequelize:

| Table | Key columns |
|---|---|
| `users` | id, username, password_hash, is_admin, created_at |
| `sessions` | id (TEXT), data (JSON), expires_at (epoch ms) |
| `books` | id, title, author, isbn, filePath, status |
| `comics` | id, title, series, issue, year, filePath, pageCount, status |
| `comic_progress` | user_id, comic_id, page (PK: both) |
| `reading_progress` | user_id, book_id, cfi, percentage (PK: both) |
| `api_keys` | id, name, key |
| `schema_migrations` | id, applied_at |

Migrations live in `migrationRunner.ts` — add new ones to the `MIGRATIONS` array. They run automatically on startup and use `detect()` to handle pre-existing state.

## Routes

| Method | Path | Description |
|---|---|---|
| POST | `/login` `/logout` | Auth |
| GET | `/` | Book library |
| POST | `/upload` | Upload books (EPUB/PDF/etc) |
| GET | `/reader/:id` | EPUB/PDF reader |
| GET | `/books/file/:id` | Serve book file |
| POST | `/books/:id/progress` | Save reading progress |
| POST | `/books/:id/status` | Set read status |
| DELETE | `/books/:id` | Delete book |
| GET | `/comics` | Comics library (series cards) |
| GET | `/comics/series/:name` | Series detail page |
| POST | `/comics/upload` | Upload comics (CBZ/CBR) |
| POST | `/comics/ingest` | API ingest endpoint (API key auth) |
| GET | `/comics/read/:id` | Comic reader |
| GET | `/comics/pages/:id` | Comic page list |
| PATCH | `/comics/bulk` | Bulk edit comics |
| PATCH | `/comics/:id` | Edit comic metadata |
| DELETE | `/comics/:id` | Delete comic |
| GET | `/library` | Unified library view |
| GET | `/settings` | Settings page |
| POST | `/settings/password` | Change password |
| POST | `/admin/users` | Create user (admin) |
| DELETE | `/admin/users/:id` | Delete user (admin) |
| POST | `/admin/api-keys` | Create API key (admin) |
| DELETE | `/admin/api-keys/:id` | Delete API key (admin) |
| POST | `/admin/migrations/run` | Run pending migrations (admin) |

## Authentication & API Keys

- **UI auth**: session cookie (`booknook.sid`) — use `requireAuth` / `requireAdmin` middleware
- **API auth**: Bearer token via `api_keys` table — use `requireApiKey()` in `app.ts`
- Admin user is bootstrapped from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars on first start

## Upload Error Handling

Both `/upload` and `/comics/upload` return `c.json(results, 207 | 200)` with per-file status (`imported | duplicate | error`). The client surfaces 207 partial-error responses as a toast. Filenames are sanitized via `path.basename` + null-byte strip — no naming convention is enforced.

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
- `ctx.db` — the Sequelize instance
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

- Cover images are cached under `cache/covers/` — books use `${id}.jpg`, comics use `c${id}.jpg`
- Comic pages are extracted on-demand via 7z (never stored); page count is cached in DB
- PDF cover extraction uses `pdftoppm` (poppler), not ImageMagick
- Session cleanup runs with 1% probability on each request (probabilistic GC)
- `maxRequestBodySize` is set to 2GB in the Bun serve call

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
