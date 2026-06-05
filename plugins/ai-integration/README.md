# example plugin

A minimal reference plugin that demonstrates every hook the plugin system exposes. It adds a "Notes" section where users can attach text notes to books.

See [`plugins/pluginCreation.md`](../pluginCreation.md) for a full explanation of how the plugin API works.

## What it demonstrates

- Creating a plugin-owned SQLite table
- Adding a sidebar nav item with a custom icon
- Injecting a stylesheet and a client-side script
- Registering page and API routes
- Listening to a lifecycle event (`bookDeleted`)

## Routes (all under `/plugins/example`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Lists all notes with book titles |
| `POST` | `/notes` | Creates a note — body: `{ book_id, note }` |
| `DELETE` | `/notes/:id` | Deletes a note |
