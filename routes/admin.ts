import { Hono } from 'hono';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User, ApiKey, Book, Comic, ComicSeries, ReadingProgress, UserBookAccess, UserComicAccess } from '../database';
import { requireAdmin } from '../middleware/auth';
import { render } from '../utils/render';
import { getMigrationStatus, runPendingMigrations } from '../utils/migrationRunner';
import type { AppVariables } from '../types';

const router = new Hono<{ Variables: AppVariables }>();

router.get('/library', requireAdmin, async c => {
    const books  = await Book.findAll({ order: [['title', 'ASC']] });
    const comics = await Comic.findAll({ order: [['series', 'ASC'], ['issue', 'ASC'], ['title', 'ASC']] });
    const seriesNames = [...new Set(comics.filter(comic => comic.series).map(comic => comic.series!))].sort();
    const seriesRecords = await ComicSeries.findAll({ where: { name: seriesNames } });
    const seriesDescMap = new Map(seriesRecords.map(s => [s.name, s.description]));
    const series = seriesNames.map(name => ({
        name,
        count: comics.filter(comic => comic.series === name).length,
        description: seriesDescMap.get(name) ?? null,
    }));
    return render(c, 'library', { books, comics, series });
});

router.get('/admin/users', requireAdmin, async c => {
    const users = await User.findAll({ attributes: ['id', 'username', 'created_at', 'permissions'] });
    return render(c, 'admin-users', { users: users.map(u => u.toJSON()) });
});

router.get('/admin/users/:id/access', requireAdmin, async c => {
    const userId = Number(c.req.param('id'));
    const [bookRows, comicRows, books, comics] = await Promise.all([
        UserBookAccess.findAll({ where: { user_id: userId }, attributes: ['book_id'] }),
        UserComicAccess.findAll({ where: { user_id: userId }, attributes: ['comic_id'] }),
        Book.findAll({ attributes: ['id', 'title', 'author'], order: [['title', 'ASC']] }),
        Comic.findAll({ attributes: ['id', 'title', 'series', 'issue'], order: [['series', 'ASC'], ['title', 'ASC']] }),
    ]);
    return c.json({
        bookIds: bookRows.map(r => r.book_id),
        comicIds: comicRows.map(r => r.comic_id),
        books: books.map(b => b.toJSON()),
        comics: comics.map(c => c.toJSON()),
    });
});

router.put('/admin/users/:id/book-access', requireAdmin, async c => {
    const userId = Number(c.req.param('id'));
    const { ids } = await c.req.json() as { ids: number[] };
    await UserBookAccess.destroy({ where: { user_id: userId } });
    if (ids.length) await UserBookAccess.bulkCreate(ids.map(book_id => ({ user_id: userId, book_id })));
    return c.json({ ok: true });
});

router.put('/admin/users/:id/comic-access', requireAdmin, async c => {
    const userId = Number(c.req.param('id'));
    const { ids } = await c.req.json() as { ids: number[] };
    await UserComicAccess.destroy({ where: { user_id: userId } });
    if (ids.length) await UserComicAccess.bulkCreate(ids.map(comic_id => ({ user_id: userId, comic_id })));
    return c.json({ ok: true });
});

router.patch('/admin/users/:id/permissions', requireAdmin, async c => {
    const id = Number(c.req.param('id'));
    const body = await c.req.json() as { excluded: string[] };
    const VALID = new Set(['books', 'comics', 'plugins']);
    const excluded = (body.excluded ?? []).filter(s => VALID.has(s));
    await User.update(
        { permissions: excluded.length ? JSON.stringify(excluded) : null },
        { where: { id } }
    );
    return c.json({ ok: true });
});

router.post('/admin/users', requireAdmin, async c => {
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

router.delete('/admin/users/:id', requireAdmin, async c => {
    const id = c.req.param('id');
    if (Number(id) === c.get('session').user!.id) return c.body(null, 400);
    await User.destroy({ where: { id } });
    await ReadingProgress.destroy({ where: { user_id: id } });
    return c.body(null, 204);
});

router.post('/admin/migrations/run', requireAdmin, async c => {
    const results = await runPendingMigrations();
    return c.json(results);
});

router.post('/admin/api-keys', requireAdmin, async c => {
    const body = await c.req.parseBody();
    const name = (body['name'] as string | undefined)?.trim();
    if (!name) return c.json({ error: 'Name is required' }, 400);
    const key = 'bn_' + crypto.randomBytes(24).toString('hex');
    const apiKey = await ApiKey.create({ name, key });
    return c.json(apiKey.toJSON(), 201);
});

router.delete('/admin/api-keys/:id', requireAdmin, async c => {
    await ApiKey.destroy({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

export default router;
