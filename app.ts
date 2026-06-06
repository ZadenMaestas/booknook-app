import 'dotenv/config';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import pug from 'pug';
import db from './database';
import sessionMiddleware from './middleware/session';
import { requireAuth, requireAdmin, handleLogin, handleLogout } from './middleware/auth';
import devMiddleware from './middleware/dev';
import plugins from './plugins';
import { openZip, getEntry, parseSpine, MIME } from './utils/epubStream';
import { getPages, getPage, extractCover, parseComicInfo } from './utils/cbzUtils';
import { getEpubData, lookupByTitle, resolveISBN } from './utils/bookUtils';
import { pdfFirstPageAsJpeg } from './utils/convertUtils';
import { fetchAndCacheCover, shrinkExistingCovers } from './utils/coverUtils';
import { getMigrationStatus, runPendingMigrations } from './utils/migrationRunner';
import type { Context } from 'hono';
import type { AppVariables, ApiKey, Book, Comic, DbUser, ReadingProgress, ComicProgress } from './types/index';

const DEV = false;
const PORT = Number(process.env.PORT) || 3001;
const COMICS_DIR = path.join(__dirname, 'comics');
const COVER_DIR  = path.join(__dirname, 'cache/covers');
const BOOKS_DIR  = path.join(__dirname, 'books');
const BASEDIR    = __dirname;

type App = Hono<{ Variables: AppVariables }>;
const app: App = new Hono();

app.onError((err, c) => {
    console.error('[error]', c.req.method, c.req.path, err);
    return c.html('<h1>500 — Internal Server Error</h1><pre>' + (err instanceof Error ? err.message : String(err)) + '</pre>', 500);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function render(c: Context<{ Variables: AppVariables }>, template: string, locals: Record<string, unknown> = {}): Response {
    if (c.req.raw.signal.aborted) return new Response(null, { status: 499 });
    const session = c.get('session');
    const html = pug.renderFile(path.join(BASEDIR, 'views', `${template}.pug`), {
        basedir: BASEDIR,
        cache: !DEV,
        user: session?.user ?? null,
        currentPath: new URL(c.req.url).pathname,
        dev: DEV,
        ...plugins.getLocals(),
        ...locals,
    });
    return c.html(html);
}

// ── Static & cache ────────────────────────────────────────────────────────────

app.use('/*', serveStatic({ root: './public' }));
app.use('/cache/*', serveStatic({ root: './' }));
// Missing cache files (e.g. covers not yet fetched) must 404 here — before session
// middleware — so they don't trigger a DB read + auth check on every page load.
app.use('/cache/*', async c => c.body(null, 404));

// Serve plugin public assets before session middleware for the same reason.
for (const entry of fs.readdirSync(path.join(BASEDIR, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const publicDir = path.join(BASEDIR, 'plugins', entry.name, 'public');
    if (!fs.existsSync(publicDir)) continue;
    app.use(
        `/plugins/${entry.name}/*`,
        serveStatic({ root: publicDir, rewriteRequestPath: p => p.replace(`/plugins/${entry.name}`, '') }),
    );
}

// Browsers auto-request these paths; return 204 so they never reach the auth redirect.
for (const p of ['/favicon.ico', '/icon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/manifest.json', '/robots.txt']) {
    app.get(p, c => c.body(null, 204));
}

// ── Dev livereload ────────────────────────────────────────────────────────────

if (DEV) devMiddleware(app);

// ── Session ───────────────────────────────────────────────────────────────────

app.use('*', sessionMiddleware);

// ── Auth routes (no auth required) ───────────────────────────────────────────

app.get('/login', c => {
    if (c.get('session')?.user) return c.redirect('/');
    return render(c, 'login');
});
app.post('/login',  handleLogin);
app.post('/logout', handleLogout);

// ── API-key auth (machine clients) ───────────────────────────────────────────

function requireApiKey(c: Context<{ Variables: AppVariables }>, next: () => Promise<Response | void>) {
    const provided = c.req.header('X-API-Key');
    if (!provided) return c.body('Unauthorized', 401);
    // Check DB-managed keys first, fall back to legacy env var
    const dbMatch = db.prepare('SELECT id FROM api_keys WHERE key = ?').get(provided);
    if (dbMatch) return next();
    const envKey = process.env.INGEST_API_KEY;
    if (envKey && provided === envKey) return next();
    return c.body('Unauthorized', 401);
}

// ── Comic ingest (called by ComicScraper userscript) ─────────────────────────

app.post('/comics/ingest', requireApiKey, async c => {
    const body = await c.req.parseBody({ all: true });
    const raw  = body['comic'];
    const fileList = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const validFiles = fileList.filter((f): f is File => f instanceof File && /\.(cbz|cbr)$/i.test(f.name));

    if (!validFiles.length) return c.body('No valid CBZ/CBR file in request', 400);

    fs.mkdirSync(COMICS_DIR, { recursive: true });
    fs.mkdirSync(path.join(__dirname, 'cache/covers'), { recursive: true });

    const results: Array<{ file: string; status: 'imported' | 'duplicate' | 'error'; error?: string }> = [];

    await Promise.allSettled(validFiles.map(async file => {
        const safeName = path.basename(file.name);
        if (!/^[\w.\- ]+\.(cbz|cbr)$/i.test(safeName)) {
            results.push({ file: file.name, status: 'error', error: 'invalid filename' });
            return;
        }
        const filePath = path.join(COMICS_DIR, safeName);

        const existing = db.prepare('SELECT id FROM comics WHERE filePath = ?').get(filePath) as { id: number } | null;
        if (existing) {
            results.push({ file: file.name, status: 'duplicate' });
            return;
        }

        try {
            await Bun.write(filePath, file);
            const info    = await parseComicInfo(filePath);
            const pages   = await getPages(filePath);
            const rawName = path.basename(file.name, path.extname(file.name));
            const parsed  = parseComicFilename(rawName);
            const title   = info?.title  || (parsed.series ? `${parsed.series} #${parsed.issue}` : rawName.replace(/[-_]/g, ' '));
            const series  = info?.series || parsed.series;
            const issue   = info?.issue  || parsed.issue;
            const year    = parsed.year;

            const result = db.prepare(
                'INSERT OR IGNORE INTO comics (title, series, issue, year, filePath, pageCount) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(title, series, issue, year, filePath, pages.length) as { lastInsertRowid: number | bigint };

            if (result.lastInsertRowid) {
                const cover = await extractCover(filePath);
                if (cover) fs.writeFileSync(path.join(__dirname, 'cache/covers', `c${result.lastInsertRowid}.jpg`), cover);
                console.log(`[ingest] imported: ${file.name} → id=${result.lastInsertRowid}`);
                results.push({ file: file.name, status: 'imported' });
            } else {
                results.push({ file: file.name, status: 'duplicate' });
            }
        } catch (e) {
            const msg = (e as Error).message;
            console.error('[ingest] failed:', file.name, msg);
            try { fs.unlinkSync(filePath); } catch {}
            results.push({ file: file.name, status: 'error', error: msg });
        }
    }));

    const anyError = results.some(r => r.status === 'error');
    return c.json(results, anyError ? 207 : 200);
});

// ── All routes below require auth ─────────────────────────────────────────────

app.use('*', requireAuth);

// ── Books ─────────────────────────────────────────────────────────────────────

app.get('/', c => {
    const books = db.prepare('SELECT * FROM books').all() as Book[];
    const existingFiles = books.map(b => path.basename(b.filePath));
    return render(c, 'index', { books, existingFiles });
});

app.post('/upload', async c => {
    const body = await c.req.parseBody({ all: true });
    let files = body['uploadedBook'];
    const fileList = Array.isArray(files) ? files : files ? [files] : [];
    const validFiles = fileList.filter((f): f is File => f instanceof File);

    if (!validFiles.length) return c.body('No valid files uploaded', 400);

    const BOOK_EXTS = new Set(['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.djvu', '.fb2']);

    await Promise.allSettled(validFiles.map(async file => {
        const ext = path.extname(file.name).toLowerCase();
        if (!BOOK_EXTS.has(ext)) return;
        try {
            fs.mkdirSync(BOOKS_DIR, { recursive: true });
            const destPath = path.join(BOOKS_DIR, file.name);
            await Bun.write(destPath, file);

            let title: string | null, author: string | null, isbn: string | null, coverId: number | null = null, pdfCover: Buffer | null = null;

            if (ext === '.pdf') {
                pdfCover = await pdfFirstPageAsJpeg(destPath).catch(() => null);
                const rawName = path.basename(file.name, '.pdf');
                const lookup = await lookupByTitle(rawName);
                title   = lookup?.title   ?? rawName.replace(/[-_]/g, ' ');
                author  = lookup?.author  ?? null;
                isbn    = lookup?.isbn    ?? null;
                coverId = lookup?.coverId ?? null;
            } else {
                const data = await getEpubData(destPath);
                title  = data.title;
                author = data.author;
                isbn   = data.isbn ?? await resolveISBN(destPath, data.title, data.author);
            }

            const bookPath = destPath;
            const result = db.prepare('INSERT OR IGNORE INTO books (title, author, isbn, filePath) VALUES (?, ?, ?, ?)')
                .run(title, author, isbn, bookPath) as { lastInsertRowid: number | bigint };

            if (result.lastInsertRowid) {
                const id = Number(result.lastInsertRowid);
                if (pdfCover) {
                    fs.mkdirSync(COVER_DIR, { recursive: true });
                    fs.writeFileSync(path.join(COVER_DIR, `${id}.jpg`), pdfCover);
                } else {
                    fetchAndCacheCover(id, isbn, title, bookPath, coverId).catch(console.error);
                }
                plugins.emit('bookUploaded', { id, title, author, isbn, filePath: bookPath });
            }
        } catch (err) { console.error('Failed to process', file.name, err); }
    }));

    return c.body(null, 200);
});

app.get('/books/spine/:id', c => {
    const book = db.prepare('SELECT filePath FROM books WHERE id = ?').get(c.req.param('id')) as Pick<Book, 'filePath'> | null;
    if (!book) return c.body(null, 404);
    try {
        const { spine } = parseSpine(openZip(book.filePath));
        return c.json(spine);
    } catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get('/books/stream/:id/*', c => {
    const id = c.req.param('id');
    const book = db.prepare('SELECT filePath FROM books WHERE id = ?').get(id) as Pick<Book, 'filePath'> | null;
    if (!book) return c.body(null, 404);
    const resource = decodeURIComponent(c.req.path.slice(`/books/stream/${id}/`.length));
    try {
        const zip   = openZip(book.filePath);
        const entry = getEntry(zip, resource);
        if (!entry) return c.body(null, 404);
        const ext = path.extname(resource).toLowerCase();
        return new Response(entry.getData(), {
            headers: {
                'Content-Type':   MIME[ext] || 'application/octet-stream',
                'X-Frame-Options': 'SAMEORIGIN',
            },
        });
    } catch (e) { return c.body(null, 500); }
});

app.get('/reader/:id', c => {
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(c.req.param('id')) as Book | null;
    if (!book) return c.notFound();
    const progress = db.prepare('SELECT cfi, percentage FROM reading_progress WHERE user_id = ? AND book_id = ?')
        .get(c.get('session').user!.id, book.id) as Pick<ReadingProgress, 'cfi' | 'percentage'> | null;
    return render(c, 'reader', { book, progress: progress || null });
});

// TODO: Allow local download via this endpoint in ui
app.get('/books/file/:id', c => {
    const book = db.prepare('SELECT filePath FROM books WHERE id = ?').get(c.req.param('id')) as Pick<Book, 'filePath'> | null;
    if (!book) return c.body('Book not found', 404);
    return new Response(Bun.file(book.filePath));
});

app.post('/books/:id/progress', async c => {
    const { cfi, percentage } = await c.req.json() as { cfi: string; percentage: number };
    db.prepare(`INSERT INTO reading_progress (user_id, book_id, cfi, percentage, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, book_id) DO UPDATE SET cfi = excluded.cfi, percentage = excluded.percentage, updated_at = excluded.updated_at`)
        .run(c.get('session').user!.id, c.req.param('id'), cfi, percentage);
    return c.body(null, 204);
});

app.patch('/books/:id/status', async c => {
    const { status } = await c.req.json() as { status: string };
    if (!['none', 'want', 'reading', 'read'].includes(status)) return c.body(null, 400);
    const result = db.prepare('UPDATE books SET status = ? WHERE id = ?')
        .run(status, c.req.param('id')) as { changes: number };
    return c.body(null, result.changes ? 204 : 404);
});

app.patch('/books/:id', async c => {
    const { title, author, isbn } = await c.req.json() as { title?: string; author?: string; isbn?: string };
    if (title !== undefined) db.prepare('UPDATE books SET title = ? WHERE id = ?').run(title, c.req.param('id'));
    if (author !== undefined) db.prepare('UPDATE books SET author = ? WHERE id = ?').run(author || null, c.req.param('id'));
    if (isbn !== undefined) db.prepare('UPDATE books SET isbn = ? WHERE id = ?').run(isbn || null, c.req.param('id'));
    return c.body(null, 204);
});

app.delete('/books/:id', c => {
    const id = c.req.param('id');
    const book = db.prepare('SELECT filePath FROM books WHERE id = ?').get(id) as Pick<Book, 'filePath'> | null;
    if (!book) return c.body(null, 404);
    db.prepare('DELETE FROM books WHERE id = ?').run(id);
    db.prepare('DELETE FROM reading_progress WHERE book_id = ?').run(id);
    [book.filePath, path.join(COVER_DIR, `${id}.jpg`)].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    plugins.emit('bookDeleted', { id: Number(id), book });
    return c.body(null, 204);
});

// ── Comics ────────────────────────────────────────────────────────────────────

app.get('/comics', c => {
    const comics = db.prepare('SELECT * FROM comics ORDER BY series, title').all() as Comic[];
    const isSpecial = (issue: string | null) => !issue || !/^\d+$/.test(issue);
    const sortIssues = (items: Comic[]) => items.sort((a, b) => {
        const as_ = isSpecial(a.issue), bs_ = isSpecial(b.issue);
        if (as_ !== bs_) return as_ ? 1 : -1;
        if (!as_) return parseInt(a.issue!, 10) - parseInt(b.issue!, 10);
        return (a.issue || a.title).localeCompare(b.issue || b.title);
    });
    const seriesMap = new Map<string, Comic[]>();
    const standalone: Comic[] = [];
    for (const comic of comics) {
        if (comic.series) {
            if (!seriesMap.has(comic.series)) seriesMap.set(comic.series, []);
            seriesMap.get(comic.series)!.push(comic);
        } else { standalone.push(comic); }
    }
    const groups = [...seriesMap.entries()].map(([name, items]) => ({ name, items: sortIssues(items) }));
    return render(c, 'comics', { groups, standalone });
});

function parseComicFilename(raw: string): { series: string | null; year: number | null; issue: string | null } {
    const withYear = raw.match(/^(.+?)\s+\((\d{4})\)\s+#?0*(\d+)/);
    if (withYear) return {
        series: withYear[1].trim(),
        year:   parseInt(withYear[2], 10),
        issue:  parseInt(withYear[3], 10).toString(),
    };
    const noYear = raw.match(/^(.+?)\s+#?0*(\d+)$/);
    if (noYear) return {
        series: noYear[1].trim(),
        year:   null,
        issue:  parseInt(noYear[2], 10).toString(),
    };
    return { series: null, year: null, issue: null };
}

app.post('/comics/upload', async c => {
    const body = await c.req.parseBody({ all: true });
    const raw = body['comic'];
    const fileList = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const validFiles = fileList.filter((f): f is File => f instanceof File && /\.(cbz|cbr)$/i.test(f.name));

    if (!validFiles.length) return c.body(null, 400);

    fs.mkdirSync(COMICS_DIR, { recursive: true });
    fs.mkdirSync(path.join(__dirname, 'cache/covers'), { recursive: true });

    await Promise.allSettled(validFiles.map(async file => {
        const safeName = path.basename(file.name);
        if (!/^[\w.\- ]+\.(cbz|cbr)$/i.test(safeName)) return;
        const filePath = path.join(COMICS_DIR, safeName);
        await Bun.write(filePath, file);
        try {
            const info    = await parseComicInfo(filePath);
            const pages   = await getPages(filePath);
            const rawName = path.basename(file.name, path.extname(file.name));
            const parsed  = parseComicFilename(rawName);
            const title   = info?.title  || (parsed.series ? `${parsed.series} #${parsed.issue}` : rawName.replace(/[-_]/g, ' '));
            const series  = info?.series || parsed.series;
            const issue   = info?.issue  || parsed.issue;
            const year    = parsed.year;
            const result  = db.prepare('INSERT OR IGNORE INTO comics (title, series, issue, year, filePath, pageCount) VALUES (?, ?, ?, ?, ?, ?)')
                .run(title, series, issue, year, filePath, pages.length) as { lastInsertRowid: number | bigint };
            if (result.lastInsertRowid) {
                const cover = await extractCover(filePath);
                if (cover) fs.writeFileSync(path.join(__dirname, 'cache/covers', `c${result.lastInsertRowid}.jpg`), cover);
            }
        } catch (e) { console.error('[comics] upload failed:', (e as Error).message); }
    }));

    return c.body(null, 200);
});

app.get('/comics/read/:id', c => {
    const id = c.req.param('id');
    const comic = db.prepare('SELECT * FROM comics WHERE id = ?').get(id) as Comic | null;
    if (!comic) return c.body('Not found', 404);
    const progress = db.prepare('SELECT page FROM comic_progress WHERE user_id = ? AND comic_id = ?')
        .get(c.get('session').user!.id, comic.id) as Pick<ComicProgress, 'page'> | null;
    return render(c, 'comic-reader', { comic, savedPage: progress?.page ?? 0 });
});

app.get('/comics/pages/:id', async c => {
    const comic = db.prepare('SELECT filePath FROM comics WHERE id = ?').get(c.req.param('id')) as Pick<Comic, 'filePath'> | null;
    if (!comic) return c.body(null, 404);
    try { return c.json(await getPages(comic.filePath)); }
    catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get('/comics/page/:id/*', async c => {
    const id = c.req.param('id');

    const comic = db.prepare(
        'SELECT filePath FROM comics WHERE id = ?'
    ).get(id) as Pick<Comic, 'filePath'> | null;

    if (!comic) return c.body(null, 404);

    const entry = decodeURIComponent(
        c.req.path.slice(`/comics/page/${id}/`.length)
    );

    const page = await getPage(comic.filePath, entry);

    if (!page) return c.body(null, 404);

    return new Response(page.data, {
        headers: {
            'Content-Type': page.mime,
            'Cache-Control': 'private, max-age=3600',
        },
    });
});

app.post('/comics/:id/progress', async c => {
    const { page } = await c.req.json() as { page: number };
    db.prepare(`INSERT INTO comic_progress (user_id, comic_id, page) VALUES (?, ?, ?)
        ON CONFLICT(user_id, comic_id) DO UPDATE SET page = excluded.page`)
        .run(c.get('session').user!.id, c.req.param('id'), page);
    return c.body(null, 204);
});

app.patch('/comics/:id/status', async c => {
    const { status } = await c.req.json() as { status: string };
    if (!['none','want','reading','read'].includes(status)) return c.body(null, 400);
    db.prepare('UPDATE comics SET status = ? WHERE id = ?').run(status, c.req.param('id'));
    return c.body(null, 204);
});

app.patch('/comics/bulk', async c => {
    const { ids, updates } = await c.req.json() as { ids: number[]; updates: { series?: string | null; year?: number | null } };
    if (!Array.isArray(ids) || !ids.length) return c.body(null, 400);
    const stmt = db.transaction(() => {
        for (const id of ids) {
            if ('series' in updates) db.prepare('UPDATE comics SET series = ? WHERE id = ?').run(updates.series ?? null, id);
            if ('year'   in updates) db.prepare('UPDATE comics SET year   = ? WHERE id = ?').run(updates.year   ?? null, id);
        }
    });
    stmt();
    return c.body(null, 204);
});

app.patch('/comics/:id', async c => {
    const { title, series, issue, year } = await c.req.json() as { title?: string; series?: string; issue?: string; year?: string };
    if (title !== undefined) db.prepare('UPDATE comics SET title = ? WHERE id = ?').run(title, c.req.param('id'));
    if (series !== undefined) db.prepare('UPDATE comics SET series = ? WHERE id = ?').run(series || null, c.req.param('id'));
    if (issue !== undefined) db.prepare('UPDATE comics SET issue = ? WHERE id = ?').run(issue || null, c.req.param('id'));
    if (year !== undefined) db.prepare('UPDATE comics SET year = ? WHERE id = ?').run(year ? parseInt(year, 10) : null, c.req.param('id'));
    return c.body(null, 204);
});

app.delete('/comics/:id', c => {
    const id = c.req.param('id');
    const comic = db.prepare('SELECT filePath FROM comics WHERE id = ?').get(id) as Pick<Comic, 'filePath'> | null;
    if (!comic) return c.body(null, 404);
    db.prepare('DELETE FROM comics WHERE id = ?').run(id);
    db.prepare('DELETE FROM comic_progress WHERE comic_id = ?').run(id);
    [comic.filePath, path.join(__dirname, 'cache/covers', `c${id}.jpg`)].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    return c.body(null, 204);
});

// ── Library CRUD ──────────────────────────────────────────────────────────────

app.get('/library', requireAdmin, async c => {
    const books  = db.prepare('SELECT * FROM books ORDER BY title').all() as Book[];
    const comics = db.prepare('SELECT * FROM comics ORDER BY series, CAST(issue AS INTEGER), title').all() as Comic[];
    return render(c, 'library', { books, comics });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/admin/users', requireAdmin, c => {
    const users = db.prepare('SELECT id, username, created_at FROM users').all() as Pick<DbUser, 'id' | 'username' | 'created_at'>[];
    return render(c, 'admin-users', { users });
});

app.post('/admin/users', requireAdmin, async c => {
    const body = await c.req.parseBody();
    const username = body['username'] as string;
    const password = body['password'] as string;
    if (!username || !password) return c.redirect('/admin/users?error=missing');
    const hash = await bcrypt.hash(password, 10);
    try {
        db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
    } catch { return c.redirect('/settings?error=exists'); }
    return c.redirect('/settings');
});

app.delete('/admin/users/:id', requireAdmin, c => {
    const id = c.req.param('id');
    if (Number(id) === c.get('session').user!.id) return c.body(null, 400);
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    db.prepare('DELETE FROM reading_progress WHERE user_id = ?').run(id);
    return c.body(null, 204);
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/settings', c => {
    const isAdmin = c.get('session').user!.isAdmin;
    const users = isAdmin ? db.prepare('SELECT id, username, created_at FROM users').all() : null;
    const apiKeys = isAdmin ? db.prepare('SELECT id, name, key, created_at FROM api_keys ORDER BY created_at DESC').all() as ApiKey[] : null;
    const migrations = isAdmin ? getMigrationStatus() : null;
    return render(c, 'settings', { saved: false, users, apiKeys, migrations, userError: c.req.query('error') || null });
});

app.post('/settings/password', async c => {
    const body = await c.req.parseBody();
    const current = body['current'] as string;
    const newPass  = body['next'] as string;
    const confirm  = body['confirm'] as string;
    if (newPass !== confirm) return render(c, 'settings', { error: 'Passwords do not match', saved: false });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(c.get('session').user!.id) as DbUser;
    if (!(await bcrypt.compare(current, user.password_hash)))
        return render(c, 'settings', { error: 'Current password is incorrect', saved: false });
    await bcrypt.hash(newPass, 10).then(hash =>
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
    );
    return render(c, 'settings', { saved: true });
});

// ── DB migrations ─────────────────────────────────────────────────────────────

app.post('/admin/migrations/run', requireAdmin, c => {
    const results = runPendingMigrations();
    return c.json(results);
});

// ── API key management ────────────────────────────────────────────────────────

app.post('/admin/api-keys', requireAdmin, async c => {
    const body = await c.req.parseBody();
    const name = (body['name'] as string | undefined)?.trim();
    if (!name) return c.json({ error: 'Name is required' }, 400);
    const key = 'bn_' + crypto.randomBytes(24).toString('hex');
    const result = db.prepare('INSERT INTO api_keys (name, key) VALUES (?, ?)')
        .run(name, key) as { lastInsertRowid: number | bigint };
    const row = db.prepare('SELECT id, name, key, created_at FROM api_keys WHERE id = ?')
        .get(result.lastInsertRowid) as ApiKey;
    return c.json(row, 201);
});

app.delete('/admin/api-keys/:id', requireAdmin, c => {
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(c.req.param('id'));
    return c.body(null, 204);
});

// ── Plugins & start ───────────────────────────────────────────────────────────

await plugins.load(app, db);

shrinkExistingCovers().catch(e => console.error('[covers]', e));

Bun.serve({ fetch: app.fetch, port: PORT, maxRequestBodySize: 2 * 1024 * 1024 * 1024 });
console.log(`Booknook listening on http://localhost:${PORT}`);
