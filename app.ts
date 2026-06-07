import 'dotenv/config';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import pug from 'pug';
import { sequelize, User, Book, Comic, ApiKey, ComicProgress, ReadingProgress, ComicSeries } from './database';
import sessionMiddleware from './middleware/session';
import { requireAuth, requireAdmin, handleLogin, handleLogout } from './middleware/auth';
import plugins from './plugins';
import { getPages, getPage, extractCover, parseComicInfo } from './utils/cbzUtils';
import { getEpubData, lookupByTitle, resolveISBN } from './utils/bookUtils';
import { pdfFirstPageAsJpeg } from './utils/convertUtils';
import { fetchAndCacheCover, shrinkExistingCovers } from './utils/coverUtils';
import { getMigrationStatus, runPendingMigrations } from './utils/migrationRunner';
import type { Context } from 'hono';
import type { AppVariables } from './types';

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
        cache: true,
        user: session?.user ?? null,
        currentPath: new URL(c.req.url).pathname,
        ...plugins.getLocals(),
        ...locals,
    });
    return c.html(html);
}

// ── Static & cache ────────────────────────────────────────────────────────────

app.use('/*', serveStatic({ root: './public' }));
app.use('/cache/*', serveStatic({ root: './' }));
app.use('/cache/*', async c => c.body(null, 404));

for (const entry of fs.readdirSync(path.join(BASEDIR, 'plugins'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const publicDir = path.join(BASEDIR, 'plugins', entry.name, 'public');
    if (!fs.existsSync(publicDir)) continue;
    app.use(
        `/plugins/${entry.name}/*`,
        serveStatic({ root: publicDir, rewriteRequestPath: p => p.replace(`/plugins/${entry.name}`, '') }),
    );
}

for (const p of ['/favicon.ico', '/icon.png', '/apple-touch-icon.png', '/apple-touch-icon-precomposed.png', '/manifest.json', '/robots.txt']) {
    app.get(p, c => c.body(null, 204));
}

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

async function requireApiKey(c: Context<{ Variables: AppVariables }>, next: () => Promise<Response | void>) {
    const provided = c.req.header('X-API-Key');
    if (!provided) return c.body('Unauthorized', 401);
    const dbMatch = await ApiKey.findOne({ where: { key: provided }, attributes: ['id'] });
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
        const safeName = path.basename(file.name).replace(/\0/g, '');
        if (!safeName) { results.push({ file: file.name, status: 'error', error: 'invalid filename' }); return; }
        const filePath = path.join(COMICS_DIR, safeName);

        const existing = await Comic.findOne({ where: { filePath }, attributes: ['id'] });
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

            const [comic, created] = await Comic.findOrCreate({
                where: { filePath },
                defaults: { title, series, issue, year, pageCount: pages.length },
            });

            if (created) {
                const cover = await extractCover(filePath);
                if (cover) fs.writeFileSync(path.join(__dirname, 'cache/covers', `c${comic.id}.jpg`), cover);
                console.log(`[ingest] imported: ${file.name} → id=${comic.id}`);
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

app.get('/', async c => {
    const books = await Book.findAll();
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

    const results: Array<{ file: string; status: 'imported' | 'duplicate' | 'error'; error?: string }> = [];

    await Promise.allSettled(validFiles.map(async file => {
        const ext = path.extname(file.name).toLowerCase();
        if (!BOOK_EXTS.has(ext)) {
            results.push({ file: file.name, status: 'error', error: 'unsupported extension' });
            return;
        }
        fs.mkdirSync(BOOKS_DIR, { recursive: true });
        const destPath = path.join(BOOKS_DIR, file.name);
        try {
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

            const [book, created] = await Book.findOrCreate({
                where: { filePath: destPath },
                defaults: { title, author, isbn },
            });

            if (created) {
                if (pdfCover) {
                    fs.mkdirSync(COVER_DIR, { recursive: true });
                    fs.writeFileSync(path.join(COVER_DIR, `${book.id}.jpg`), pdfCover);
                } else {
                    fetchAndCacheCover(book.id, isbn, title, destPath, coverId).catch(console.error);
                }
                plugins.emit('bookUploaded', { id: book.id, title, author, isbn, filePath: destPath });
            }
            results.push({ file: file.name, status: created ? 'imported' : 'duplicate' });
        } catch (err) {
            const msg = (err as Error).message;
            console.error('[upload] failed:', file.name, msg);
            try { fs.unlinkSync(destPath); } catch {}
            results.push({ file: file.name, status: 'error', error: msg });
        }
    }));

    const anyError = results.some(r => r.status === 'error');
    return c.json(results, anyError ? 207 : 200);
});


app.get('/reader/:id', async c => {
    const book = await Book.findByPk(c.req.param('id'));
    if (!book) return c.notFound();
    if (!book.status || book.status === 'none' || book.status === 'want')
        await Book.update({ status: 'reading' }, { where: { id: book.id } });
    const progress = await ReadingProgress.findOne({
        where: { user_id: c.get('session').user!.id, book_id: book.id },
        attributes: ['cfi', 'percentage'],
    });
    return render(c, 'reader', { book, progress: progress || null });
});

app.get('/books/file/:id', async c => {
    const book = await Book.findByPk(c.req.param('id'), { attributes: ['filePath'] });
    if (!book) return c.body('Book not found', 404);
    return new Response(Bun.file(book.filePath));
});

app.post('/books/:id/progress', async c => {
    const { cfi, percentage } = await c.req.json() as { cfi: string; percentage: number };
    const id = c.req.param('id');
    await ReadingProgress.upsert({
        user_id: c.get('session').user!.id,
        book_id: Number(id),
        cfi,
        percentage,
        updated_at: new Date().toISOString(),
    });
    if (percentage >= 0.95)
        await Book.update({ status: 'read' }, { where: { id } });
    return c.body(null, 204);
});

app.patch('/books/:id/status', async c => {
    const { status } = await c.req.json() as { status: string };
    if (!['none', 'want', 'reading', 'read'].includes(status)) return c.body(null, 400);
    const [count] = await Book.update({ status }, { where: { id: c.req.param('id') } });
    return c.body(null, count ? 204 : 404);
});

app.patch('/books/:id', async c => {
    const { title, author, isbn } = await c.req.json() as { title?: string; author?: string; isbn?: string };
    const updates: Record<string, string | null> = {};
    if (title  !== undefined) updates.title  = title;
    if (author !== undefined) updates.author = author || null;
    if (isbn   !== undefined) updates.isbn   = isbn   || null;
    if (Object.keys(updates).length) await Book.update(updates, { where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

app.delete('/books/:id', async c => {
    const id = c.req.param('id');
    const book = await Book.findByPk(id, { attributes: ['filePath'] });
    if (!book) return c.body(null, 404);
    await Book.destroy({ where: { id } });
    await ReadingProgress.destroy({ where: { book_id: id } });
    [book.filePath, path.join(COVER_DIR, `${id}.jpg`)].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    plugins.emit('bookDeleted', { id: Number(id), book: book.toJSON() });
    return c.body(null, 204);
});

// ── Comics ────────────────────────────────────────────────────────────────────

app.get('/comics', async c => {
    const comics = await Comic.findAll({ order: [['series', 'ASC'], ['title', 'ASC']] });
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
    const groups = [...seriesMap.entries()].map(([name, items]) => {
        const sorted = sortIssues(items);
        const readCount = sorted.filter(c => c.status === 'read').length;
        // reversed so front cover renders last in DOM (naturally on top)
        const coverIds = sorted.slice(0, 3).map(c => c.id).reverse();
        return { name, count: sorted.length, readCount, coverIds };
    });
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

    const results: Array<{ file: string; status: 'imported' | 'duplicate' | 'error'; error?: string }> = [];

    await Promise.allSettled(validFiles.map(async file => {
        const safeName = path.basename(file.name).replace(/\0/g, '');
        if (!safeName) { results.push({ file: file.name, status: 'error', error: 'invalid filename' }); return; }
        const filePath = path.join(COMICS_DIR, safeName);
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
            const [comic, created] = await Comic.findOrCreate({
                where: { filePath },
                defaults: { title, series, issue, year, pageCount: pages.length },
            });
            if (created) {
                const cover = await extractCover(filePath);
                if (cover) fs.writeFileSync(path.join(__dirname, 'cache/covers', `c${comic.id}.jpg`), cover);
            }
            results.push({ file: file.name, status: created ? 'imported' : 'duplicate' });
        } catch (e) {
            const msg = (e as Error).message;
            console.error('[comics/upload] failed:', file.name, msg);
            try { fs.unlinkSync(filePath); } catch {}
            results.push({ file: file.name, status: 'error', error: msg });
        }
    }));

    const anyError = results.some(r => r.status === 'error');
    return c.json(results, anyError ? 207 : 200);
});

app.get('/comics/series/:name', async c => {
    const name = decodeURIComponent(c.req.param('name'));
    const [comics, seriesRecord] = await Promise.all([
        Comic.findAll({ where: { series: name } }),
        ComicSeries.findOne({ where: { name } }),
    ]);
    if (!comics.length) return c.notFound();
    const isSpecial = (issue: string | null) => !issue || !/^\d+$/.test(issue);
    comics.sort((a, b) => {
        const as_ = isSpecial(a.issue), bs_ = isSpecial(b.issue);
        if (as_ !== bs_) return as_ ? 1 : -1;
        if (!as_) return parseInt(a.issue!, 10) - parseInt(b.issue!, 10);
        return (a.issue || a.title).localeCompare(b.issue || b.title);
    });
    const years = comics.map(c => c.year).filter((y): y is number => y != null);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    const yearRange = minYear ? (minYear === maxYear ? String(minYear) : `${minYear} – ${maxYear}`) : null;
    const readCount = comics.filter(c => c.status === 'read').length;
    const readPct = Math.round(readCount / comics.length * 100);
    const continueId = comics.find(c => c.status === 'reading')?.id
        ?? comics.find(c => !c.status || c.status === 'none' || c.status === 'want')?.id
        ?? comics[0].id;
    const allRead = readCount === comics.length;
    return render(c, 'series', { name, comics, yearRange, readCount, readPct, continueId, allRead, seriesDescription: seriesRecord?.description ?? null });
});

app.patch('/comics/series/:name', async c => {
    const name = decodeURIComponent(c.req.param('name'));
    const { description } = await c.req.json() as { description?: string };
    await ComicSeries.upsert({ name, description: description?.trim() || null });
    return c.body(null, 204);
});

app.get('/comics/read/:id', async c => {
    const id = c.req.param('id');
    const comic = await Comic.findByPk(id);
    if (!comic) return c.body('Not found', 404);
    if (!comic.status || comic.status === 'none' || comic.status === 'want')
        await Comic.update({ status: 'reading' }, { where: { id } });
    const progress = await ComicProgress.findOne({
        where: { user_id: c.get('session').user!.id, comic_id: comic.id },
        attributes: ['page'],
    });
    return render(c, 'comic-reader', { comic, savedPage: progress?.page ?? 0 });
});

app.get('/comics/pages/:id', async c => {
    const comic = await Comic.findByPk(c.req.param('id'), { attributes: ['filePath'] });
    if (!comic) return c.body(null, 404);
    try { return c.json(await getPages(comic.filePath)); }
    catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

app.get('/comics/page/:id/*', async c => {
    const id = c.req.param('id');
    const comic = await Comic.findByPk(id, { attributes: ['filePath'] });
    if (!comic) return c.body(null, 404);
    const entry = decodeURIComponent(c.req.path.slice(`/comics/page/${id}/`.length));
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
    const id = c.req.param('id');
    await ComicProgress.upsert({
        user_id: c.get('session').user!.id,
        comic_id: Number(id),
        page,
    });
    const comic = await Comic.findByPk(id, { attributes: ['pageCount'] });
    if (comic && comic.pageCount > 0 && page >= comic.pageCount - 1)
        await Comic.update({ status: 'read' }, { where: { id } });
    return c.body(null, 204);
});

app.patch('/comics/:id/status', async c => {
    const { status } = await c.req.json() as { status: string };
    if (!['none','want','reading','read'].includes(status)) return c.body(null, 400);
    await Comic.update({ status }, { where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

app.patch('/comics/bulk', async c => {
    const { ids, updates } = await c.req.json() as { ids: number[]; updates: { series?: string | null; year?: number | null } };
    if (!Array.isArray(ids) || !ids.length) return c.body(null, 400);
    await sequelize.transaction(async t => {
        for (const id of ids) {
            const fields: Record<string, string | number | null> = {};
            if ('series' in updates) fields.series = updates.series ?? null;
            if ('year'   in updates) fields.year   = updates.year   ?? null;
            if (Object.keys(fields).length) await Comic.update(fields, { where: { id }, transaction: t });
        }
    });
    return c.body(null, 204);
});

app.patch('/comics/:id', async c => {
    const { title, series, issue, year, description } = await c.req.json() as { title?: string; series?: string; issue?: string; year?: string; description?: string };
    const fields: Record<string, string | number | null> = {};
    if (title       !== undefined) fields.title       = title;
    if (series      !== undefined) fields.series      = series || null;
    if (issue       !== undefined) fields.issue       = issue  || null;
    if (year        !== undefined) fields.year        = year ? parseInt(year, 10) : null;
    if (description !== undefined) fields.description = description?.trim() || null;
    if (Object.keys(fields).length) await Comic.update(fields, { where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

app.delete('/comics/:id', async c => {
    const id = c.req.param('id');
    const comic = await Comic.findByPk(id, { attributes: ['filePath'] });
    if (!comic) return c.body(null, 404);
    await Comic.destroy({ where: { id } });
    await ComicProgress.destroy({ where: { comic_id: id } });
    [comic.filePath, path.join(__dirname, 'cache/covers', `c${id}.jpg`)].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    return c.body(null, 204);
});

// ── Library CRUD ──────────────────────────────────────────────────────────────

app.get('/library', requireAdmin, async c => {
    const books  = await Book.findAll({ order: [['title', 'ASC']] });
    const comics = await Comic.findAll({ order: [['series', 'ASC'], ['issue', 'ASC'], ['title', 'ASC']] });
    const seriesNames = [...new Set(comics.filter(c => c.series).map(c => c.series!))].sort();
    const seriesRecords = await ComicSeries.findAll({ where: { name: seriesNames } });
    const seriesDescMap = new Map(seriesRecords.map(s => [s.name, s.description]));
    const series = seriesNames.map(name => ({
        name,
        count: comics.filter(c => c.series === name).length,
        description: seriesDescMap.get(name) ?? null,
    }));
    return render(c, 'library', { books, comics, series });
});

// ── Admin ─────────────────────────────────────────────────────────────────────

app.get('/admin/users', requireAdmin, async c => {
    const users = await User.findAll({ attributes: ['id', 'username', 'created_at'] });
    return render(c, 'admin-users', { users });
});

app.post('/admin/users', requireAdmin, async c => {
    const body = await c.req.parseBody();
    const username = body['username'] as string;
    const password = body['password'] as string;
    if (!username || !password) return c.redirect('/admin/users?error=missing');
    const hash = await bcrypt.hash(password, 10);
    try {
        await User.create({ username, password_hash: hash });
    } catch { return c.redirect('/settings?error=exists'); }
    return c.redirect('/settings');
});

app.delete('/admin/users/:id', requireAdmin, async c => {
    const id = c.req.param('id');
    if (Number(id) === c.get('session').user!.id) return c.body(null, 400);
    await User.destroy({ where: { id } });
    await ReadingProgress.destroy({ where: { user_id: id } });
    return c.body(null, 204);
});

// ── Settings ──────────────────────────────────────────────────────────────────

app.get('/settings', async c => {
    const isAdmin = c.get('session').user!.isAdmin;
    const users      = isAdmin ? await User.findAll({ attributes: ['id', 'username', 'created_at'] }) : null;
    const apiKeys    = isAdmin ? await ApiKey.findAll({ order: [['created_at', 'DESC']] }) : null;
    const migrations = isAdmin ? await getMigrationStatus() : null;
    return render(c, 'settings', { saved: false, users, apiKeys, migrations, userError: c.req.query('error') || null });
});

app.post('/settings/password', async c => {
    const body = await c.req.parseBody();
    const current = body['current'] as string;
    const newPass  = body['next'] as string;
    const confirm  = body['confirm'] as string;
    if (newPass !== confirm) return render(c, 'settings', { error: 'Passwords do not match', saved: false });
    const user = await User.findByPk(c.get('session').user!.id);
    if (!user) return render(c, 'settings', { error: 'User not found', saved: false });
    if (!(await bcrypt.compare(current, user.password_hash)))
        return render(c, 'settings', { error: 'Current password is incorrect', saved: false });
    const hash = await bcrypt.hash(newPass, 10);
    await User.update({ password_hash: hash }, { where: { id: user.id } });
    return render(c, 'settings', { saved: true });
});

// ── DB migrations ─────────────────────────────────────────────────────────────

app.post('/admin/migrations/run', requireAdmin, async c => {
    const results = await runPendingMigrations();
    return c.json(results);
});

// ── API key management ────────────────────────────────────────────────────────

app.post('/admin/api-keys', requireAdmin, async c => {
    const body = await c.req.parseBody();
    const name = (body['name'] as string | undefined)?.trim();
    if (!name) return c.json({ error: 'Name is required' }, 400);
    const key = 'bn_' + crypto.randomBytes(24).toString('hex');
    const apiKey = await ApiKey.create({ name, key });
    return c.json(apiKey.toJSON(), 201);
});

app.delete('/admin/api-keys/:id', requireAdmin, async c => {
    await ApiKey.destroy({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

// ── Plugins & start ───────────────────────────────────────────────────────────

export { app };

if (import.meta.main) {
    await plugins.load(app, sequelize);
    shrinkExistingCovers().catch(e => console.error('[covers]', e));
    Bun.serve({ fetch: app.fetch, port: PORT, maxRequestBodySize: 2 * 1024 * 1024 * 1024 });
    console.log(`Booknook listening on http://localhost:${PORT}`);
}
