# Comics

## Supported formats

| Format | Notes |
|---|---|
| `.cbz` | ZIP archive of images — fully supported |
| `.cbr` | RAR archive of images — fully supported |

## Uploading

Use the upload button on the `/comics` page. On upload, Booknook:

1. Saves the file to `comics/`
2. Parses `ComicInfo.xml` from inside the archive (if present) to extract title, series, and issue number
3. Falls back to the filename if no `ComicInfo.xml` is found
4. Extracts the first image as a cover and saves it to `cache/covers/`

## Series grouping

Comics with the same `series` value from `ComicInfo.xml` are automatically grouped on the library page. Issues are sorted numerically; specials (non-numeric issue values) are sorted alphabetically and placed after numbered issues.

## Reading

Click a comic to open the page-by-page reader. Page position is saved automatically per-user.

## Reading status

Same statuses as books: `none`, `want`, `reading`, `read`.

## ComicInfo.xml

Booknook reads the following fields from `ComicInfo.xml`:

| Field | Used for |
|---|---|
| `<Title>` | Comic title |
| `<Series>` | Series grouping |
| `<Number>` | Issue number |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/comics` | Comics library page |
| `POST` | `/comics/upload` | Upload a CBZ/CBR file (multipart `comic`) |
| `GET` | `/comics/read/:id` | Open the comic reader |
| `GET` | `/comics/pages/:id` | JSON list of page filenames in the archive |
| `GET` | `/comics/page/:id/*` | Stream a single page image |
| `POST` | `/comics/:id/progress` | Save page position `{ page }` |
| `PATCH` | `/comics/:id/status` | Update reading status `{ status }` |
| `DELETE` | `/comics/:id` | Delete a comic and its cover |
