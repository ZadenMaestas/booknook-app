# Books

## Supported formats

| Format | Notes |
|---|---|
| `.epub` | Native — metadata and cover extracted directly |
| `.pdf` | Cover extracted from first page via `pdftoppm`; metadata looked up by title via Google Books |
| `.mobi`, `.azw`, `.azw3` | Accepted and stored |
| `.djvu`, `.fb2` | Accepted and stored |

## Uploading

Drag and drop one or more files onto the library page, or use the upload button. Multiple files are processed in parallel.

On upload, Booknook:

1. Saves the file to `books/`
2. Extracts title, author, and ISBN from file metadata (EPUB) or filename (PDF)
3. Fetches and caches a cover image from the file or Google Books API
4. Silently skips duplicates (same file path already in the database)

The upload response is a JSON array of per-file results with `status: "imported" | "duplicate" | "error"`. The UI surfaces any errors as a toast.

## Reading

Click any book to open the in-browser reader, powered by [foliate-js](https://github.com/johnfactotum/foliate-js). Reading position (CFI + percentage) is saved automatically per-user as you read.

## Reading status

Status is tracked per book and updated automatically:

| Status | Set when |
|---|---|
| `none` | Default on upload |
| `want` | Set manually via context menu |
| `reading` | Set automatically when the reader is opened |
| `read` | Set automatically when reading progress reaches ≥ 95% |

You can also set any status manually by right-clicking a book card.

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Library home — lists all books |
| `POST` | `/upload` | Upload one or more book files (multipart `uploadedBook`) |
| `GET` | `/reader/:id` | Open the in-browser reader |
| `GET` | `/books/file/:id` | Download the raw book file |
| `POST` | `/books/:id/progress` | Save reading progress `{ cfi, percentage }` |
| `PATCH` | `/books/:id/status` | Update reading status `{ status }` |
| `PATCH` | `/books/:id` | Edit metadata `{ title, author, isbn }` |
| `DELETE` | `/books/:id` | Delete a book and its cover |
