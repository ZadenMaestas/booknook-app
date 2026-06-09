import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { Comic, ComicProgress, ComicSeries, sequelize } from '../database';
import { requireApiKey } from '../middleware/apiKey';
import { render } from '../utils/render';
import { getPages, getPage } from '../utils/cbzUtils';
import { resolveComicMeta, saveComicCover } from '../utils/comicImport';
import { COMICS_DIR, COVER_DIR } from '../utils/paths';
import { requirePermission } from '../middleware/auth';
import type { AppVariables, UploadResult } from '../types';

// ── Helpers ────────────────────────────────────────────────────────────────────

const isSpecialIssue = (issue: string | null) => !issue || !/^\d+$/.test(issue);

function sortByIssue<T extends { issue: string | null; title: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
        const as_ = isSpecialIssue(a.issue), bs_ = isSpecialIssue(b.issue);
        if (as_ !== bs_) return as_ ? 1 : -1;
        if (!as_) return parseInt(a.issue!, 10) - parseInt(b.issue!, 10);
        return (a.issue || a.title).localeCompare(b.issue || b.title);
    });
}

async function importComicFile(file: File): Promise<UploadResult> {
    const safeName = path.basename(file.name).replace(/\0/g, '');
    if (!safeName) return { file: file.name, status: 'error', error: 'invalid filename' };
    const filePath = path.join(COMICS_DIR, safeName);

    const existing = await Comic.findOne({ where: { filePath }, attributes: ['id'] });
    if (existing) return { file: file.name, status: 'duplicate' };

    try {
        await Bun.write(filePath, file);
        const meta = await resolveComicMeta(filePath);

        const [comic, created] = await Comic.findOrCreate({
            where: { filePath },
            defaults: meta as any,
        });

        if (created) await saveComicCover(comic.id, filePath);
        return { file: file.name, status: created ? 'imported' : 'duplicate' };
    } catch (e) {
        const msg = (e as Error).message;
        console.error('[comics] failed:', file.name, msg);
        try { fs.unlinkSync(filePath); } catch {}
        return { file: file.name, status: 'error', error: msg };
    }
}

// ── API router (pre-auth, API-key protected) ───────────────────────────────────

export const comicsApi = new Hono<{ Variables: AppVariables }>();

comicsApi.post('/ingest', requireApiKey, async c => {
    const body = await c.req.parseBody({ all: true });
    const raw  = body['comic'];
    const fileList = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const validFiles = fileList.filter((f): f is File => f instanceof File && /\.(cbz|cbr)$/i.test(f.name));

    if (!validFiles.length) return c.body('No valid CBZ/CBR file in request', 400);
    fs.mkdirSync(COMICS_DIR, { recursive: true });
    fs.mkdirSync(COVER_DIR, { recursive: true });

    const results = await Promise.all(validFiles.map(importComicFile));
    const anyError = results.some(r => r.status === 'error');
    return c.json(results, anyError ? 207 : 200);
});

// ── UI router (session-auth protected) ────────────────────────────────────────

const router = new Hono<{ Variables: AppVariables }>();
router.use('*', requirePermission('comics'));

router.get('/', async c => {
    const comics = await Comic.findAll({ order: [['series', 'ASC'], ['title', 'ASC']] });
    const seriesMap = new Map<string, typeof comics>();
    const standalone: typeof comics = [];
    for (const comic of comics) {
        if (comic.series) {
            if (!seriesMap.has(comic.series)) seriesMap.set(comic.series, []);
            seriesMap.get(comic.series)!.push(comic);
        } else { standalone.push(comic); }
    }
    const groups = [...seriesMap.entries()].map(([name, items]) => {
        const sorted = sortByIssue(items);
        const readCount = sorted.filter(item => item.status === 'read').length;
        // reversed so front cover renders last in DOM (naturally on top)
        const coverIds = sorted.slice(0, 3).map(item => item.id).reverse();
        return { name, count: sorted.length, readCount, coverIds };
    });
    return render(c, 'comics', { groups, standalone });
});

router.post('/upload', async c => {
    const body = await c.req.parseBody({ all: true });
    const raw = body['comic'];
    const fileList = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const validFiles = fileList.filter((f): f is File => f instanceof File && /\.(cbz|cbr)$/i.test(f.name));

    if (!validFiles.length) return c.body(null, 400);
    fs.mkdirSync(COMICS_DIR, { recursive: true });
    fs.mkdirSync(COVER_DIR, { recursive: true });

    const results = await Promise.all(validFiles.map(importComicFile));
    const anyError = results.some(r => r.status === 'error');
    return c.json(results, anyError ? 207 : 200);
});

router.get('/series/:name', async c => {
    const name = decodeURIComponent(c.req.param('name'));
    const [comics, seriesRecord] = await Promise.all([
        Comic.findAll({ where: { series: name } }),
        ComicSeries.findOne({ where: { name } }),
    ]);
    if (!comics.length) return c.notFound();
    const sorted = sortByIssue(comics);
    const years = sorted.map(comic => comic.year).filter((y): y is number => y != null);
    const minYear = years.length ? Math.min(...years) : null;
    const maxYear = years.length ? Math.max(...years) : null;
    const yearRange = minYear ? (minYear === maxYear ? String(minYear) : `${minYear} – ${maxYear}`) : null;
    const readCount = sorted.filter(comic => comic.status === 'read').length;
    const readPct = Math.round(readCount / sorted.length * 100);
    const continueId = sorted.find(comic => comic.status === 'reading')?.id
        ?? sorted.find(comic => !comic.status || comic.status === 'none' || comic.status === 'want')?.id
        ?? sorted[0].id;
    const allRead = readCount === sorted.length;
    return render(c, 'series', { name, comics: sorted, yearRange, readCount, readPct, continueId, allRead, seriesDescription: seriesRecord?.description ?? null });
});

router.patch('/series/:name', async c => {
    const name = decodeURIComponent(c.req.param('name'));
    const { description } = await c.req.json() as { description?: string };
    await ComicSeries.upsert({ name, description: description?.trim() || null });
    return c.body(null, 204);
});

router.get('/read/:id', async c => {
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

router.get('/pages/:id', async c => {
    const comic = await Comic.findByPk(c.req.param('id'), { attributes: ['filePath'] });
    if (!comic) return c.body(null, 404);
    try { return c.json(await getPages(comic.filePath)); }
    catch (e) { return c.json({ error: (e as Error).message }, 500); }
});

router.get('/page/:id/*', async c => {
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

router.post('/:id/progress', async c => {
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

router.patch('/:id/status', async c => {
    const { status } = await c.req.json() as { status: string };
    if (!['none','want','reading','read'].includes(status)) return c.body(null, 400);
    await Comic.update({ status }, { where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

router.patch('/bulk', async c => {
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

router.patch('/:id', async c => {
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

router.delete('/:id', async c => {
    const id = c.req.param('id');
    const comic = await Comic.findByPk(id, { attributes: ['filePath'] });
    if (!comic) return c.body(null, 404);
    await Comic.destroy({ where: { id } });
    await ComicProgress.destroy({ where: { comic_id: id } });
    [comic.filePath, path.join(COVER_DIR, `c${id}.jpg`)].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    return c.body(null, 204);
});

export default router;
