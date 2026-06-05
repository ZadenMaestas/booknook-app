# Writing a Plugin

Plugins live in `plugins/<name>/` and are loaded automatically at startup.

## File structure

```
plugins/
  my-plugin/
    plugin.ts        ← required (or plugin.js)
    views/           ← optional Pug templates
    public/          ← optional static assets (CSS, JS, images)
```

## Minimal plugin

`plugin.ts` must export a default object with a `name` and a `register` function:

```ts
import type { PluginContext } from '../index';

export default {
    name: 'my-plugin',
    version: '1.0.0',

    register({ db, router, pluginDir, render, addNavItem, addStylesheet, addScript, on }: PluginContext) {
        // your plugin code here
    },
};
```

## The `register` context

### `db`

A `bun:sqlite` `Database` instance connected to the main `booknook.db`.

```ts
db.prepare('CREATE TABLE IF NOT EXISTS myplugin_items (id INTEGER PRIMARY KEY, value TEXT)').run();
const rows = db.prepare('SELECT * FROM myplugin_items').all();
```

Always prefix your table names to avoid collisions. Use `CREATE TABLE IF NOT EXISTS` so they survive restarts.

### `router`

A Hono router automatically mounted at `/plugins/<folder-name>`. Add your routes here.

```ts
router.get('/', c => {
    return render(c, path.join(pluginDir, 'views/index.pug'), { items: [] });
});

router.post('/api/thing', async c => {
    const body = await c.req.json();
    return c.json({ ok: true }, 201);
});
```

### `render(c, templatePath, locals?)`

Renders a Pug template with the standard layout variables pre-populated (`user`, `currentPath`, plugin nav items, etc.).

```ts
return render(c, path.join(pluginDir, 'views/page.pug'), { data });
```

Always use the absolute `pluginDir`-based path — relative paths won't resolve from inside the registry.

### `pluginDir`

Absolute path to your plugin folder.

### `addNavItem(item)`

Adds a link to the sidebar navigation.

```ts
addNavItem({
    label: 'My Plugin',
    href: '/plugins/my-plugin',
    icon: `<svg width="18" height="18" .../>`,  // optional inline SVG
});
```

### `addStylesheet(href)` / `addScript(src)`

Injects a `<link>` or `<script>` tag into every page. Serve files from `public/` — they're automatically mounted at `/plugins/<name>/`.

```ts
addStylesheet('/plugins/my-plugin/styles.css');
addScript('/plugins/my-plugin/client.js');
```

### `on(event, handler)`

Subscribe to lifecycle events emitted by the core app.

```ts
on('bookDeleted', ({ id, book }) => {
    db.prepare('DELETE FROM myplugin_items WHERE book_id = ?').run(id);
});
```

#### Available events

| Event | Payload | Fired when |
|---|---|---|
| `bookDeleted` | `{ id: number, book: object }` | A book is removed from the library |
| `bookUploaded` | `{ id, title, author, isbn, filePath }` | A book is successfully uploaded and registered |

## Static assets

Files in `public/` are served at `/plugins/<name>/` automatically. They are also available at `/plugins/<name>/static/` as an alias.

## Tips

- Prefix all DB table names: `myplugin_notes`, not `notes`.
- Errors thrown from `register()` are caught and logged — your plugin is skipped, but the app keeps running.
- If your plugin needs an external process or binary, start setup in `register()` so it's ready by the first request. Use a flag to avoid re-running setup on every call.
