# Getting Started

## Docker (recommended)

Docker is the easiest way to run Booknook. All system dependencies are included in the image.

### 1. Clone the repo

```bash
git clone https://github.com/ZadenMaestas/booknook-app.git
cd booknook-app
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
SESSION_SECRET=<random string — run: openssl rand -hex 32>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme
DATA_DIR=/app/data
```

See [Configuration](configuration.md) for all options.

### 3. Start

```bash
docker compose up -d
```

Open [http://localhost:3001](http://localhost:3001) and log in with your admin credentials.

### Persistent data

| Host path | Purpose |
|---|---|
| `./data` | SQLite database |
| `./books` | Uploaded EPUB/PDF files |
| `./comics` | Uploaded CBZ/CBR files |
| `./cache` | Extracted cover images |

These directories are created automatically on first run. Back up `./data` to preserve your library.

### Updating

```bash
git pull
docker compose build
docker compose up -d
```

---

## Development

For working on Booknook locally without Docker.

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- `imagemagick` — cover image resizing
- `poppler-utils` — PDF cover extraction (`pdftoppm`)
- `7zip` — CBZ/CBR extraction

### Setup

```bash
git clone https://github.com/ZadenMaestas/booknook-app.git
cd booknook-app
bun install
cp .env.example .env   # edit as needed
bun run dev            # starts with --watch auto-restart
```

The server listens on **port 3001** by default (override with `PORT=`).

### First login

On first start, if `ADMIN_USERNAME` and `ADMIN_PASSWORD` are set, that admin account is created automatically. The admin panel is at `/library` (manage content) and `/settings` (users, API keys).

### Directory layout

```
app.ts              — Hono server and all core routes
database.ts         — Sequelize models, schema sync, admin bootstrap
middleware/
  auth.ts           — requireAuth, requireAdmin, handleLogin/Logout
  session.ts        — cookie session middleware
bookUtils.ts        — EPUB metadata, Google Books lookup, ISBN resolution
cbzUtils.ts         — CBZ/CBR page extraction, ComicInfo.xml parsing
convertUtils.ts     — PDF first-page → JPEG
coverUtils.ts       — cover fetch, cache, resize
epubStream.ts       — EPUB zip streaming
plugins/            — plugin registry + one subdirectory per plugin
views/              — Pug templates (layout.pug is the shared shell)
public/             — static assets (foliate-js reader, CSS, icons)
```
