# Books

## Supported formats

| Format | Notes |
|---|---|
| `.epub` | Native — metadata and cover extracted directly |
| `.pdf` | Converted to EPUB at upload time; cover extracted from first page |
| `.mobi`, `.azw`, `.azw3` | Accepted but not converted |
| `.djvu`, `.fb2` | Accepted but not converted |

## Uploading

Drag and drop one or more files onto the library page, or use the upload button. Multiple files are processed in parallel. Duplicate files (same path) are silently skipped.

On upload, Booknook:

1. Saves the file to `books/`
2. Extracts title, author, and ISBN from the file metadata
3. For PDFs: looks up metadata by filename via the Google Books API
4. Normalises to EPUB where possible
5. Fetches and caches a cover image (from the file or Google Books)

## Reading

Click any book to open the in-browser reader, powered by [foliate-js](https://github.com/johnfactotum/foliate-js). Reading position (CFI + percentage) is saved automatically per-user as you read.

## Reading status

Right-click a book (or use the context menu) to set a status:

| Status | Meaning |
|---|---|
| `none` | Default / unset |
| `want` | Want to read |
| `reading` | Currently reading |
| `read` | Finished |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Library home — lists all books |
| `POST` | `/upload` | Upload one or more book files (multipart `uploadedBook`) |
| `GET` | `/reader/:id` | Open the in-browser reader |
| `GET` | `/books/spine/:id` | JSON spine for a book |
| `GET` | `/books/stream/:id/*` | Stream a resource (chapter, image) from inside an EPUB |
| `GET` | `/books/file/:id` | Download the raw book file |
| `POST` | `/books/:id/progress` | Save reading progress `{ cfi, percentage }` |
| `PATCH` | `/books/:id/status` | Update reading status `{ status }` |
| `DELETE` | `/books/:id` | Delete a book and its cover |
