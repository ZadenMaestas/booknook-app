# Deployment

## Docker Compose (recommended)

The included `docker-compose.yml` builds the image and mounts persistent volumes for user data.

```bash
docker compose up -d
```

### Persistent volumes

| Host path | Container path | Purpose |
|---|---|---|
| `./books` | `/app/books` | Uploaded EPUB/PDF files |
| `./comics` | `/app/comics` | Uploaded CBZ/CBR files |
| `./cache` | `/app/cache` | Extracted cover images |
| `./booknook.db` | `/app/booknook.db` | SQLite database |

### Environment

Copy `.env.example` to `.env` and set at minimum:

```env
SESSION_SECRET=<random-string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
```

The `docker-compose.yml` reads `.env` automatically via `env_file`.

## Building the image manually

```bash
docker build -t booknook .
docker run -p 3001:3001 --env-file .env \
  -v ./books:/app/books \
  -v ./comics:/app/comics \
  -v ./cache:/app/cache \
  -v ./booknook.db:/app/booknook.db \
  booknook
```

## System dependencies (non-Docker)

The Dockerfile documents the exact packages needed. For a bare-metal install:

| Package | Purpose |
|---|---|
| `imagemagick` | Cover image resizing (`magick` / `convert`) |
| `poppler-utils` | PDF cover extraction (`pdftoppm`) |
| `python3`, `python3-venv` | comic-dl plugin |
| `chromium` | comic-dl headless browser |
| `xz-utils` | annas-archive binary extraction |

## Reverse proxy

Booknook itself does not handle TLS. Put it behind nginx or Caddy in production.

Minimal Caddy example:

```
your.domain {
    reverse_proxy localhost:3001
}
```

## Updating

```bash
git pull
docker compose build
docker compose up -d
```

The database schema is managed by `database.ts` using `CREATE TABLE IF NOT EXISTS`, so updates are non-destructive.
