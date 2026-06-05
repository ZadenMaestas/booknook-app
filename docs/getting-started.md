# Getting Started

## Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- `imagemagick` — for cover image resizing (`magick` / `convert`)
- `poppler-utils` — for PDF cover extraction (`pdftoppm`)

## Installation

```bash
git clone <repo-url>
cd booknook
bun install
```

## Configuration

Copy the example env file and fill in the values you need:

```bash
cp .env.example .env
```

At minimum, set `SESSION_SECRET` for any non-development use. See [Configuration](configuration.md) for all options.

## Running

=== "Development"

    ```bash
    bun run dev
    ```

    Hot-reloads on file changes via a livereload websocket injected automatically in dev mode.

=== "Production"

    ```bash
    bun run start
    ```

=== "Docker"

    ```bash
    docker compose up -d
    ```

    See [Deployment](deployment.md) for details.

The server listens on **port 3001** by default (override with `PORT=`).

## First login

On first start, if `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set in `.env`, that admin account is created automatically. Otherwise, create the first user by inserting directly into the database or via the `/admin/users` panel once you have an account.

## Directory layout

```
app.ts            — Hono server and all core routes
database.ts       — bun:sqlite setup and schema migrations
plugins/          — plugin registry + one subdirectory per plugin
middleware/       — auth, session, dev livereload
utils/            — EPUB/CBZ parsing, cover fetching, metadata lookup
views/            — Pug templates (layout.pug is the shared shell)
public/           — static assets (foliate-js reader, CSS, icons)
books/            — uploaded EPUB/PDF files (git-ignored)
comics/           — uploaded CBZ/CBR files (git-ignored)
cache/covers/     — extracted cover images (git-ignored)
```
