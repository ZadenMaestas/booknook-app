# Plugin System

Plugins are loaded at startup from subdirectories of `plugins/`. Any folder containing a `plugin.ts` or `plugin.js` is loaded (the `example/` folder is always skipped). Each plugin's `register()` function receives a context object with access to the database, router, and extension hooks. If `register()` throws, the plugin is skipped and the app continues normally.

## Bundled plugins

| Plugin | Description |
|---|---|
| [ai-integration](ai-integration.md) | AI-powered book recommendations via Google Gemini |

---

## Writing a plugin

Plugins live in `plugins/<name>/` and are loaded automatically at startup.

### File structure

```
plugins/
  my-plugin/
    plugin.ts        ← required (or plugin.js)
    views/           ← optional Pug templates
    public/          ← optional static assets (CSS, JS, images)
```

### Minimal plugin

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

### The `register` context

#### `db`

The [Sequelize](https://sequelize.org) instance connected to the main `booknook.db`. Use it to define models or run raw queries.

```ts
// Raw query
await db.query('CREATE TABLE IF NOT EXISTS myplugin_items (id INTEGER PRIMARY KEY, value TEXT)');
const [rows] = await db.query('SELECT * FROM myplugin_items');
```

Always prefix your table names to avoid collisions.

#### `router`

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

#### `render(c, templatePath, locals?)`

Renders a Pug template with the standard layout variables pre-populated (`user`, `currentPath`, plugin nav items, etc.).

```ts
return render(c, path.join(pluginDir, 'views/page.pug'), { data });
```

Always use the absolute `pluginDir`-based path — relative paths won't resolve from inside the registry.

#### `pluginDir`

Absolute path to your plugin folder.

#### `addNavItem(item)`

Adds a link to the sidebar navigation.

```ts
addNavItem({
    label: 'My Plugin',
    href: '/plugins/my-plugin',
    icon: `<svg width="18" height="18" .../>`,  // optional inline SVG
});
```

#### `addStylesheet(href)` / `addScript(src)`

Injects a `<link>` or `<script>` tag into every page. Serve files from `public/` — they're automatically mounted at `/plugins/<name>/static/`.

```ts
addStylesheet('/plugins/my-plugin/static/styles.css');
addScript('/plugins/my-plugin/static/client.js');
```

#### `on(event, handler)`

Subscribe to lifecycle events emitted by the core app.

```ts
on('bookDeleted', ({ id, book }) => {
    db.query('DELETE FROM myplugin_items WHERE book_id = ?', { replacements: [id] });
});
```

##### Available events

| Event | Payload | Fired when |
|---|---|---|
| `bookDeleted` | `{ id: number, book: object }` | A book is removed from the library |
| `bookUploaded` | `{ id, title, author, isbn, filePath }` | A book is successfully uploaded and registered |

## Tips

- Prefix all DB table names: `myplugin_notes`, not `notes`.
- Errors thrown from `register()` are caught and logged — your plugin is skipped, but the app keeps running.
- If your plugin needs an external process or binary, start setup in `register()` so it's ready by the first request.
