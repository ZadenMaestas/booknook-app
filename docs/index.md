# Booknook

A self-hosted personal library server for ebooks and comics. Runs on [Bun](https://bun.sh) with Hono, SQLite via Sequelize, and a plugin system for extending functionality.

## Features

- **Ebooks** — upload and read EPUB/PDF files with a full in-browser reader powered by [foliate-js](https://github.com/johnfactotum/foliate-js)
- **Comics** — upload CBZ/CBR files; series are auto-detected and shown as browsable series pages with stacked cover art
- **Series views** — dedicated page per series with hero cover, year range, reading progress bar, and a Continue Reading button
- **Descriptions** — per-series and per-issue descriptions, editable from the manage page
- **Auto-status** — opening a book or comic sets it to *reading*; finishing sets it to *read* automatically
- **Multi-user** — session-based auth with per-user reading progress; admin panel for user management
- **Plugin system** — drop a folder into `plugins/` to add new routes, nav items, and lifecycle hooks
- **Docker-ready** — single `docker compose up` for production deployment

## Quick start

```bash
git clone https://github.com/ZadenMaestas/booknook-app.git
cd booknook-app
bun install
cp .env.example .env   # edit as needed
bun run dev
```

Open [http://localhost:3001](http://localhost:3001).

See [Getting Started](getting-started.md) for a full walkthrough.
