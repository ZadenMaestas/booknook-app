# Configuration

All configuration is done via environment variables, typically in a `.env` file.

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `SESSION_SECRET` | **yes** | — | Secret used to sign session cookies. Generate with `openssl rand -hex 32`. |
| `PORT` | no | `3001` | Port the server listens on. |
| `DATA_DIR` | no | — | Directory for the SQLite database file. Useful in Docker to point at a volume. |

## Admin bootstrap

Read only at startup. If the named user does not exist yet, it is created with admin privileges.

| Variable | Required | Description |
|---|---|---|
| `ADMIN_USERNAME` | no | Username for the auto-created admin account. |
| `ADMIN_PASSWORD` | no | Password for the auto-created admin account. |

## Optional integrations

| Variable | Used by | Description |
|---|---|---|
| `GOOGLE_BOOKS_API_KEY` | core | Improves book metadata and cover quality via the Google Books API. |
| `GEMINI_API_KEY` | ai-integration plugin | Google Gemini API key for AI book recommendations. |

## Example `.env`

```env
SESSION_SECRET=change-me-to-something-random
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Optional
GOOGLE_BOOKS_API_KEY=
GEMINI_API_KEY=
DATA_DIR=./data
```
