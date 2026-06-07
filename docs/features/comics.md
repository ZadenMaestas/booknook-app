# Comics

## Supported formats

| Format | Notes |
|---|---|
| `.cbz` | ZIP archive of images — fully supported |
| `.cbr` | RAR archive of images — fully supported |

## Uploading

Drag and drop files onto the comics page or use the upload button. Any filename is accepted — no specific naming convention is required.

On upload, Booknook:

1. Saves the file to `comics/`
2. Parses `ComicInfo.xml` from inside the archive (if present) to extract title, series, issue number, and year
3. Falls back to filename parsing for series/issue/year if no `ComicInfo.xml` is found
4. Extracts the first image as a cover and saves it to `cache/covers/`

The upload response is a JSON array of per-file results (`imported | duplicate | error`). Errors are shown as a toast.

## Series browsing

The `/comics` page shows one card per series (using the first issue's cover) plus standalone comics. Clicking a series card opens the series detail page.

### Series page

Each series has a dedicated page at `/comics/series/:name` with:

- **Hero section** — large cover image, series name, year range, issue count, read count, and progress bar
- **Continue Reading button** — links to the first *reading* issue, or the first unread issue, or issue #1 (if all read, shows *Read Again*)
- **Issue grid** — all issues sorted numerically, each showing the issue number badge, year, and page count
- **Series description** — shown below the hero when set
- **Issue descriptions** — shown as a subtitle on each issue card when set

## Descriptions

Both series and individual issues support a free-text description field:

- **Series description** — edit from the **Series** tab in the manage page (`/library`)
- **Issue description** — edit from the comic's Edit button in the manage page

## Reading status

Status is tracked per comic and updated automatically:

| Status | Set when |
|---|---|
| `none` | Default on upload |
| `want` | Set manually via context menu |
| `reading` | Set automatically when the reader is opened |
| `read` | Set automatically when the last page is reached |

Right-click any issue card to set status manually.

## Filename naming schema

When no `ComicInfo.xml` is present, Booknook parses the filename to extract series, year, and issue. Two patterns are recognised (leading zeros in the issue number are stripped):

**With year**
```
Series Name (YYYY) NNN.cbz
Series Name (YYYY) #NNN.cbz
```
Examples:
```
Rick And Morty (2015) 001.cbz        → series: Rick And Morty, year: 2015, issue: 1
The Batman (2021) #056.cbz           → series: The Batman,     year: 2021, issue: 56
```

**Without year**
```
Series Name NNN.cbz
Series Name #NNN.cbz
```
Examples:
```
Saga 001.cbz                         → series: Saga,  issue: 1
Invincible #100.cbz                  → series: Invincible, issue: 100
```

If neither pattern matches, the full filename (minus extension) is used as the title with no series or issue assigned. `ComicInfo.xml` always takes precedence over filename parsing.

## ComicInfo.xml

Booknook reads the following fields from `ComicInfo.xml`:

| Field | Used for |
|---|---|
| `<Title>` | Comic title |
| `<Series>` | Series grouping |
| `<Number>` | Issue number |
| `<Year>` | Publication year |

## API endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/comics` | Comics library — series cards + standalone |
| `GET` | `/comics/series/:name` | Series detail page |
| `PATCH` | `/comics/series/:name` | Update series description `{ description }` |
| `POST` | `/comics/upload` | Upload CBZ/CBR files (multipart `comic`) |
| `POST` | `/comics/ingest` | Ingest via API key (Bearer token auth) |
| `GET` | `/comics/read/:id` | Open the comic reader |
| `GET` | `/comics/pages/:id` | JSON list of page entries in the archive |
| `GET` | `/comics/page/:id/*` | Stream a single page image |
| `POST` | `/comics/:id/progress` | Save page position `{ page }` |
| `PATCH` | `/comics/:id/status` | Update reading status `{ status }` |
| `PATCH` | `/comics/:id` | Edit metadata `{ title, series, issue, year, description }` |
| `PATCH` | `/comics/bulk` | Bulk update `{ ids, updates: { series?, year? } }` |
| `DELETE` | `/comics/:id` | Delete a comic and its cover |
