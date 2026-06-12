# Booknook

Self-hosted digital library for books (EPUB/PDF) and comics (CBZ/CBR). Hono + Bun + Pug + SQLite/Sequelize.

@styles.md

## Dev

```bash
bun run dev       # watch mode
bun run typecheck # tsc --noEmit
```

## Stack & Layout

- Routes: `routes/` (books, comics, admin) mounted in `app.ts`
- DB models: `database.ts` — User, Session, Book, Comic, ComicSeries, ApiKey, ComicProgress, ReadingProgress, UserBookAccess, UserComicAccess
- Migrations: `migrationRunner.ts` — add to `MIGRATIONS[]`, auto-run on startup
- Utils: `bookUtils`, `cbzUtils`, `convertUtils`, `coverUtils`, `epubStream`
- Views: `views/*.pug` — layout, index, reader, comics, series, comic-reader, library, settings, admin-users, login
- Plugins: `plugins/<name>/plugin.ts` exports `{ name, register(ctx) }` — gets `ctx.router`, `ctx.db`, `ctx.render()`, `ctx.addNavItem/Stylesheet/Script()`, `ctx.on(event)`

## Auth & API Keys

- UI: session cookie `booknook.sid` — `requireAuth` / `requireAdmin` middleware
- API: Bearer token from `api_keys` table — `requireApiKey()`
- Admin bootstrapped from `ADMIN_USERNAME` / `ADMIN_PASSWORD` env vars

## Env

```
ADMIN_USERNAME=   ADMIN_PASSWORD=   SESSION_SECRET=   # required
PORT=   GOOGLE_BOOKS_API_KEY=   GEMINI_API_KEY=   DATA_DIR=
```

## Key Invariants

- Covers cached at `cache/covers/` — `${id}.jpg` books, `c${id}.jpg` comics
- Comic pages extracted on-demand via 7z; page count cached in DB
- PDF covers via `pdftoppm`; image resize via ImageMagick
- Uploads return 207 multi-status with per-file `imported|duplicate|error`
- `maxRequestBodySize` 2GB; session GC runs at 1% probability per request

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## On feature implementation planning

- Use `graphify query` to find related code
- Use `graphify explain` to understand code
- Use `graphify path` to find code paths
