# Database Schema

Booknook uses a single SQLite file managed by [Sequelize](https://sequelize.org). On every startup, Sequelize creates any missing tables and adds any missing columns to existing tables — no manual migrations needed.

The database file is `booknook.db` in the project root, or inside `DATA_DIR` if that env var is set.

## `users`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `username` | TEXT UNIQUE | |
| `password_hash` | TEXT | bcrypt, cost 10 |
| `is_admin` | INTEGER | `1` grants access to admin routes |
| `created_at` | TEXT | |

## `sessions`

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Random session ID stored in cookie |
| `data` | TEXT | JSON-encoded session payload |
| `expires_at` | INTEGER | Unix ms; cleaned up probabilistically on each request |

## `books`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `title` | TEXT | |
| `author` | TEXT | |
| `isbn` | TEXT UNIQUE | |
| `filePath` | TEXT UNIQUE | Absolute path on disk |
| `status` | TEXT | `none` / `want` / `reading` / `read` |
| `created_at` | TEXT | |

`status` is set automatically: opening the reader sets `reading`; reaching ≥ 95% sets `read`.

## `reading_progress`

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER PK | |
| `book_id` | INTEGER PK | Composite PK |
| `cfi` | TEXT | EPUB CFI string — restores exact position in foliate-js |
| `percentage` | REAL | 0.0 – 1.0 |
| `updated_at` | TEXT | |

## `comics`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `title` | TEXT | |
| `series` | TEXT | Used for grouping; populated from `ComicInfo.xml` or filename |
| `issue` | TEXT | Issue number string |
| `year` | INTEGER | Publication year |
| `filePath` | TEXT UNIQUE | |
| `pageCount` | INTEGER | |
| `status` | TEXT | `none` / `want` / `reading` / `read` |
| `description` | TEXT | Per-issue synopsis, editable from the manage page |
| `created_at` | TEXT | |

`status` is set automatically: opening the reader sets `reading`; reaching the last page sets `read`.

## `comic_series`

Stores series-level metadata, keyed by the series name string.

| Column | Type | Notes |
|---|---|---|
| `name` | TEXT PK | Matches `comics.series` |
| `description` | TEXT | Series description, editable from the manage page |

## `comic_progress`

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER PK | |
| `comic_id` | INTEGER PK | Composite PK |
| `page` | INTEGER | 0-based page index |

## `api_keys`

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | |
| `name` | TEXT | Human-readable label |
| `key` | TEXT UNIQUE | Bearer token for API access |
| `created_at` | TEXT | |

Used by the `/comics/ingest` endpoint and any external integrations.

## Plugin tables

Plugins create their own tables inside their `register()` function. By convention, table names are prefixed with the plugin name (e.g. `ai_integration_*`).
