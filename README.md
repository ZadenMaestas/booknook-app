# Booknook

A self-hosted personal library server for ebooks, comics, and audiobooks. Runs on [Bun](https://bun.sh) with Hono,
SQLite, and a plugin system for extending functionality.

## Screenshots

| Library | Comics |
|---|---|
| ![Library](screenshots/library.png) | ![Comics](screenshots/comics.png) |

| AI Integration | Settings |
|---|---|
| ![AI Integration](screenshots/ai-integration.png) | ![Settings](screenshots/settings.png) |

![Manage](screenshots/manage.png)

## Features

- **Ebooks** — upload and read EPUB files with a full in-browser reader (foliate-js)
- **Comics** — upload CBZ/CBR files; series and issues are auto-grouped from filename and can otherwise be manually
  modified in bulk
- **Multi-user** — session-based auth with per-user reading progress; admin can manage users
- **Plugin system** — drop a folder with a `plugin.js` into `plugins/` to add new functionality

## Setup

```bash
bun install
cp .env.example .env   # edit as needed
bun run dev            # hot-reloads on file changes
```

The server listens on **port 3001** by default.

### Environment variables

| Variable               | Required                  | Description                                       |
|------------------------|---------------------------|---------------------------------------------------|
| `SESSION_SECRET`       | no                        | Express session secret (defaults to `dev-secret`) |
| `ANNAS_SECRET_KEY`     | for anna's archive plugin | Your Anna's Archive API key                       |
| `ANNAS_BASE_URL`       | no                        | Override the default mirror URL                   |
| `GOOGLE_BOOKS_API_KEY` | no                        | Improves cover art fetching quality               |

## Directory layout

```
app.js            — Express server and all core routes
database.js       — better-sqlite3 setup and schema migrations
plugins/          — plugin registry + one subdirectory per plugin
  index.js        — PluginRegistry (loads, mounts, and hooks plugins)
middleware/       — auth, session store, upload handling, dev livereload
utils/            — epub/cbz parsing, cover fetching, book metadata
views/            — Pug templates (layout.pug is the shared shell)
public/           — static assets (foliate-js reader, styles, icons)
books/            — uploaded EPUB/PDF files (git-ignored)
comics/           — uploaded CBZ/CBR files (git-ignored)
cache/covers/     — extracted cover images (git-ignored)
```

## Plugins

Plugins live in `plugins/<name>/plugin.js` and are loaded automatically at startup. See [
`plugins/pluginCreation.md`](plugins/pluginCreation.md) for a guide on writing your own, and [
`plugins/example/`](plugins/example/) for a minimal working reference.

Bundled plugins:

| Plugin                                           | Description                                            |
|--------------------------------------------------|--------------------------------------------------------|
| [annas-archive](plugins/annas-archive/README.md) | Search and download books directly from Anna's Archive |
| [comic-dl](plugins/comic-dl/README.md)           | Download comics from the web via a headless browser    |

## Scripts

```bash
bun run start        # production start
bun run dev          # dev mode with livereload


bun run landing:dev     # vite dev server for landing page
bun run landing:build   # production build
bun run landing:deploy  # wrangler deploy to Cloudflare Workers
```
