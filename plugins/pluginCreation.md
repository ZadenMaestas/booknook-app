# Writing a Booknook plugin

Plugins are Node.js modules that live in their own subdirectory under `plugins/`. The registry scans that directory at startup and calls `register()` on every folder that contains a `plugin.js`.

## Minimal plugin

```
plugins/
  my-plugin/
    plugin.js        ← required
    views/           ← optional Pug templates
    public/          ← optional static assets (CSS, JS, images)
```

`plugin.js` must export a `register` function:

```js
module.exports = {
    name: 'my-plugin',
    version: '1.0.0',

    register({ db, router, pluginDir, addNavItem, addStylesheet, addScript, on }) {
        // your plugin code here
    },
};
```

## The `register` context object

### `db`

A [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) database instance connected to the main `booknook.db`. Use it to read and write data.

```js
db.prepare('CREATE TABLE IF NOT EXISTS my_table (id INTEGER PRIMARY KEY, value TEXT)').run();
const rows = db.prepare('SELECT * FROM my_table').all();
```

Create your own tables with `IF NOT EXISTS` so they survive restarts. Prefix table names with your plugin name to avoid collisions.

### `router`

An Express router automatically mounted at `/plugins/<your-folder-name>`. Add routes here.

```js
router.get('/', (req, res) => {
    res.render(path.join(pluginDir, 'views/index.pug'), { data: [] });
});

router.post('/api/thing', (req, res) => {
    // req.body is available (express.json() is applied globally)
    res.status(201).json({ ok: true });
});
```

### `pluginDir`

Absolute path to your plugin folder. Use it when rendering Pug templates:

```js
res.render(path.join(pluginDir, 'views/page.pug'), locals);
```

### `addNavItem(item)`

Adds a link to the sidebar navigation. `item` shape:

```js
addNavItem({
    label: 'My Plugin',
    href: '/plugins/my-plugin',
    icon: `<svg .../>`,   // optional inline SVG, 18×18px recommended
});
```

### `addStylesheet(href)` / `addScript(src)`

Injects a `<link>` or `<script>` tag into every page. Serve the files from your `public/` directory — they're automatically mounted at `/plugins/<name>/`.

```js
addStylesheet('/plugins/my-plugin/styles.css');
addScript('/plugins/my-plugin/client.js');
```

### `on(event, handler)`

Subscribe to lifecycle events emitted by the core app.

```js
on('bookDeleted', ({ id, book }) => {
    db.prepare('DELETE FROM my_table WHERE book_id = ?').run(id);
});
```

Available events:

| Event | Payload | Fired when |
|---|---|---|
| `bookDeleted` | `{ id: number, book: object }` | A book is removed from the library |

## Static assets

Any files in `public/` are served at `/plugins/<name>/` automatically. Reference them with that URL path.

## Full example

The [`example/`](example/) plugin implements all of the above in ~60 lines. Read it alongside this guide.

## Tips

- Keep your DB table names prefixed: `myplugin_notes`, not `notes`.
- Render templates with the absolute `pluginDir`-based path — relative paths won't resolve correctly from inside the plugin registry.
- Use `ensureBinary()` / `ensureVenv()` patterns (see existing plugins) if your plugin needs an external process: start the setup in `register()` so it's ready by the time the user makes their first request.
- Errors thrown from `register()` are caught and logged; your plugin will be skipped but the rest of the app continues.
