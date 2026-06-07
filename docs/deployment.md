# Deployment

## Docker Compose (recommended)

The included `docker-compose.yml` builds the image and mounts persistent volumes for user data.

```bash
docker compose up -d
```

### Persistent volumes

| Host path | Container path | Purpose |
|---|---|---|
| `./data` | `/app/data` | SQLite database (`booknook.db`) |
| `./books` | `/app/books` | Uploaded EPUB/PDF files |
| `./comics` | `/app/comics` | Uploaded CBZ/CBR files |
| `./cache` | `/app/cache` | Extracted cover images |

### Environment

Copy `.env.example` to `.env` and set at minimum:

```env
SESSION_SECRET=<random-string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
DATA_DIR=/app/data
```

The `docker-compose.yml` reads `.env` automatically via `env_file`.

## Building the image manually

```bash
docker build -t booknook .
docker run -p 3001:3001 --env-file .env \
  -v ./data:/app/data \
  -v ./books:/app/books \
  -v ./comics:/app/comics \
  -v ./cache:/app/cache \
  booknook
```

## System dependencies (non-Docker)

The Dockerfile documents the exact packages needed. For a bare-metal install:

| Package | Purpose |
|---|---|
| `imagemagick` | Cover image resizing |
| `poppler-utils` | PDF cover extraction (`pdftoppm`) |
| `7zip` | CBZ/CBR archive extraction |
| `curl` | Health check |

## Reverse proxy

Booknook does not handle TLS. Put it behind nginx or Caddy in production.

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

The database schema is managed by Sequelize. On startup, new tables are created automatically and missing columns are added to existing tables — no manual migrations needed and existing data is never touched.
