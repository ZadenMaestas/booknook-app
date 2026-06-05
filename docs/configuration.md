# Configuration

All configuration is done via environment variables, typically in a `.env` file.

## Core

| Variable | Required | Default | Description |
|---|---|---|---|
| `SESSION_SECRET` | no | `dev-secret` | Secret used to sign session cookies. Set a strong random value in production. |
| `PORT` | no | `3001` | Port the server listens on. |
| `NODE_ENV` | no | — | Set to `production` to disable the livereload overlay. |

## Admin bootstrap

These are only read at startup. If the named user doesn't exist yet, it is created with admin privileges.

| Variable | Required | Description |
|---|---|---|
| `ADMIN_USERNAME` | no | Username for the auto-created admin account. |
| `ADMIN_PASSWORD` | no | Password for the auto-created admin account. |

## Plugin variables

| Variable | Used by | Description |
|---|---|---|
| `GEMINI_API_KEY` | ai-integration | Google Gemini API key for AI book recommendations. |
| `GOOGLE_BOOKS_API_KEY` | core | Improves cover art fetch quality via the Google Books API. |
| `ANNAS_SECRET_KEY` | annas-archive | Anna's Archive API key for search and download. |
| `ANNAS_BASE_URL` | annas-archive | Override the default Anna's Archive mirror URL. |

## Example `.env`

```env
SESSION_SECRET=change-me-to-something-random
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Optional: better cover images
GOOGLE_BOOKS_API_KEY=

# Optional: AI recommendations
GEMINI_API_KEY=
```
