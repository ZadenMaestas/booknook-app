# AI Integration Plugin

The `ai-integration` plugin adds AI-powered book recommendations using [Google Gemini](https://ai.google.dev/).

## Setup

Set `GEMINI_API_KEY` in your `.env`:

```env
GEMINI_API_KEY=your-key-here
```

Without this key the plugin loads but the recommendation feature is disabled and shows a configuration notice in the UI.

## Usage

1. Navigate to **AI** in the sidebar.
2. Select a book from your library.
3. Click **Get Recommendations** — Gemini returns five books with a short reason for each.
4. Recommendations are saved per-book and displayed on revisit.

Generating new recommendations for a book replaces the previously stored ones.

## Rate limits

The plugin uses the free Gemini tier by default. If you hit the quota, the UI displays a friendly message with a retry countdown when available.

## Routes

All routes are under `/plugins/ai-integration`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Recommendations dashboard |
| `GET` | `/api/book/:id` | Fetch book metadata as JSON |
| `POST` | `/api/recommendations/:id` | Generate (and store) recommendations for a book |

## Database

The plugin creates one table:

```sql
CREATE TABLE IF NOT EXISTS ai_integration (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id    INTEGER NOT NULL,
    note       TEXT    NOT NULL,   -- JSON array of recommendations
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

On `bookDeleted`, the plugin cleans up its rows automatically.
