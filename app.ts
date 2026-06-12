import 'dotenv/config';
import {Hono} from 'hono';
import {serveStatic} from 'hono/bun';
import fs from 'fs';
import path from 'path';
import {sequelize} from './database';
import sessionMiddleware from './middleware/session';
import {requireAuth, handleLogin, handleLogout} from './middleware/auth';
import {render} from './utils/render';
import {backfillMissingCovers, shrinkExistingCovers} from './utils/coverUtils';
import {requirePermission} from './middleware/auth';
import plugins from './plugins';
import booksRouter from './routes/books';
import comicsRouter, {comicsApi} from './routes/comics';
import adminRouter from './routes/admin';
import settingsRouter from './routes/settings';
import type {AppVariables} from './types';
import { logger } from 'hono/logger'

const PORT = Number(process.env.PORT) || 3001;
const BASEDIR = __dirname;

type App = Hono<{ Variables: AppVariables }>;
const app: App = new Hono();

app.onError((err, c) => {
    console.error('[error]', c.req.method, c.req.path, err);
    return c.html('<h1>500 — Internal Server Error</h1><pre>' + (err instanceof Error ? err.message : String(err)) + '</pre>', 500);
});

// ── Static & cache ────────────────────────────────────────────────────────────

app.use('/*', serveStatic({root: './public'}));
// Covers are served by absolute path — serveStatic roots are CWD-relative and
// break when the app isn't started from the project root.
app.get('/cache/covers/:file', async c => {
    const name = c.req.param('file');
    if (!/^c?\d+\.jpg$/.test(name)) return c.body(null, 404);
    const file = Bun.file(path.join(BASEDIR, 'cache', 'covers', name));
    if (!await file.exists()) return c.body(null, 404);
    return new Response(file);
});
app.use('/cache/*', async c => c.body(null, 404));
app.use(logger())

for (const entry of fs.readdirSync(path.join(BASEDIR, 'plugins'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue;
    const publicDir = path.join(BASEDIR, 'plugins', entry.name, 'public');
    if (!fs.existsSync(publicDir)) continue;
    app.use(
        `/plugins/${entry.name}/*`,
        serveStatic({root: publicDir, rewriteRequestPath: p => p.replace(`/plugins/${entry.name}`, '')}),
    );
}

for (const p of ['/favicon.ico', '/icon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/manifest.json', '/robots.txt']) {
    app.get(p, c => c.body(null, 204));
}

// ── Session ───────────────────────────────────────────────────────────────────

app.use('*', sessionMiddleware);

// ── Auth routes (no session required) ────────────────────────────────────────

app.get('/login', c => {
    if (c.get('session')?.user) return c.redirect('/');
    return render(c, 'login');
});
app.post('/login', handleLogin);
app.post('/logout', handleLogout);

// ── API-key routes (machine clients, pre-session-auth) ────────────────────────

app.route('/comics', comicsApi);

// ── All routes below require session auth ─────────────────────────────────────

app.use('*', requireAuth);
app.use('/plugins/*', requirePermission('plugins'));

app.route('/', booksRouter);
app.route('/comics', comicsRouter);
app.route('/', adminRouter);
app.route('/', settingsRouter);

// ── Plugins & start ───────────────────────────────────────────────────────────

export {app};

if (import.meta.main) {
    await plugins.load(app, sequelize);
    shrinkExistingCovers()
        .then(() => backfillMissingCovers())
        .catch(e => console.error('[covers]', e));
    Bun.serve({fetch: app.fetch, port: PORT, maxRequestBodySize: 2 * 1024 * 1024 * 1024});
    console.log(`Booknook listening on http://localhost:${PORT}`);
}
