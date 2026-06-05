# Plugin System

Booknook has a first-class plugin system. Plugins are loaded at startup from subdirectories of `plugins/` and can add routes, nav items, stylesheets, scripts, and lifecycle event listeners.

## How plugins are loaded

At startup, `plugins/index.ts` scans `plugins/` for subdirectories. Any folder that contains a `plugin.ts` or `plugin.js` is loaded (the `example/` folder is always skipped). Each plugin's `register()` function is called with a context object that gives it access to the database, router, and extension hooks.

If a plugin's `register()` throws, it is skipped and the rest of the app continues normally.

## Bundled plugins

| Plugin | Description |
|---|---|
| [ai-integration](ai-integration.md) | AI-powered book recommendations via Google Gemini |

## Writing your own

See [Writing a Plugin](writing-plugins.md) for a full guide, and `plugins/example/` for a minimal working reference that demonstrates every hook.
