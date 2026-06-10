import { Hono } from 'hono';
import fs from 'fs';
import path from 'path';
import { Book, ReadingProgress, UserBookAccess } from '../database';
import { render } from '../utils/render';
import { resolveBookMeta, saveBookCover, BOOK_EXTS } from '../utils/bookImport';
import plugins from '../plugins';
import { BOOKS_DIR, COVER_DIR } from '../utils/paths';
import { requirePermission } from '../middleware/auth';
import type { AppVariables, UploadResult } from '../types';

const router = new Hono<{ Variables: AppVariables }>();
async function allowedBookIds(userId: number): Promise<Set<number> | null> {
    const rows = await UserBookAccess.findAll({ where: { user_id: userId }, attributes: ['book_id'] });
    return rows.length ? new Set(rows.map(r => r.book_id)) : null;
}

router.get('/', requirePermission('books'), async c => {
    const user = c.get('session').user!;
    const allowed = user.isAdmin ? null : await allowedBookIds(user.id);
    const books = await Book.findAll(allowed ? { where: { id: [...allowed] } } : {});
    const existingFiles = books.map(b => path.basename(b.filePath));
    return render(c, 'index', { books, existingFiles });
});

router.post('/upload', requirePermission('books'), async c => {
    const body = await c.req.parseBody({ all: true });
    const files = body['uploadedBook'];
    const fileList = Array.isArray(files) ? files : files ? [files] : [];
    const validFiles = fileList.filter((f): f is File => f instanceof File);

    if (!validFiles.length) return c.body('No valid files uploaded', 400);

    const results: UploadResult[] = [];

    for (const file of validFiles) {
        const ext = path.extname(file.name).toLowerCase();
        if (!BOOK_EXTS.has(ext)) {
            results.push({ file: file.name, status: 'error', error: 'unsupported extension' });
            return;
        }
        fs.mkdirSync(BOOKS_DIR, { recursive: true });
        const destPath = path.join(BOOKS_DIR, file.name);
        try {
            await Bun.write(destPath, file);
            const meta = await resolveBookMeta(destPath);

            const [book, created] = await Book.findOrCreate({
                where: { filePath: destPath },
                defaults: { title: meta.title, author: meta.author, isbn: meta.isbn },
            });

            if (created) {
                await saveBookCover(book.id, meta, destPath);
                plugins.emit('bookUploaded', { id: book.id, title: meta.title, author: meta.author, isbn: meta.isbn, filePath: destPath });
            }
            results.push({ file: file.name, status: created ? 'imported' : 'duplicate' });
        } catch (err) {
            const msg = (err as Error).message;
            console.error('[upload] failed:', file.name, msg);
            try { fs.unlinkSync(destPath); } catch {}
            results.push({ file: file.name, status: 'error', error: msg });
        }
    }

    const anyError = results.some(r => r.status === 'error');
    return c.json(results, anyError ? 207 : 200);
});

router.get('/reader/:id', requirePermission('books'), async c => {
    const id = Number(c.req.param('id'));
    const user = c.get('session').user!;
    if (!user.isAdmin) {
        const allowed = await allowedBookIds(user.id);
        if (allowed && !allowed.has(id)) return c.body('Forbidden', 403);
    }
    const book = await Book.findByPk(id);
    if (!book) return c.notFound();
    if (!book.status || book.status === 'none' || book.status === 'want')
        await Book.update({ status: 'reading' }, { where: { id: book.id } });
    const progress = await ReadingProgress.findOne({
        where: { user_id: user.id, book_id: book.id },
        attributes: ['cfi', 'percentage', 'page'],
    });
    return render(c, 'reader', { book, progress: progress || null });
});

router.get('/books/file/:id', requirePermission('books'), async c => {
    const id = Number(c.req.param('id'));
    const user = c.get('session').user!;
    if (!user.isAdmin) {
        const allowed = await allowedBookIds(user.id);
        if (allowed && !allowed.has(id)) return c.body('Forbidden', 403);
    }
    const book = await Book.findByPk(id, { attributes: ['filePath'] });
    if (!book) return c.body('Book not found', 404);
    return new Response(Bun.file(book.filePath));
});

router.post('/books/:id/progress', requirePermission('books'), async c => {
    const { cfi, percentage, page } = await c.req.json() as { cfi: string; percentage: number; page: number };
    const id = c.req.param('id');
    const user = c.get('session').user!;
    if (!user.isAdmin) {
        const allowed = await allowedBookIds(user.id);
        if (allowed && !allowed.has(Number(id))) return c.body('Forbidden', 403);
    }
    await ReadingProgress.upsert({
        user_id: user.id,
        book_id: Number(id),
        cfi,
        percentage,
        page: page ?? 0,
        updated_at: new Date().toISOString(),
    });
    if (percentage >= 0.95)
        await Book.update({ status: 'read' }, { where: { id } });
    return c.body(null, 204);
});

router.patch('/books/:id/status', requirePermission('books'), async c => {
    const { status } = await c.req.json() as { status: string };
    if (!['none', 'want', 'reading', 'read'].includes(status)) return c.body(null, 400);
    const [count] = await Book.update({ status }, { where: { id: c.req.param('id') } });
    return c.body(null, count ? 204 : 404);
});

router.patch('/books/:id', requirePermission('books'), async c => {
    const { title, author, isbn } = await c.req.json() as { title?: string; author?: string; isbn?: string };
    const updates: Record<string, string | null> = {};
    if (title  !== undefined) updates.title  = title;
    if (author !== undefined) updates.author = author || null;
    if (isbn   !== undefined) updates.isbn   = isbn   || null;
    if (Object.keys(updates).length) await Book.update(updates, { where: { id: c.req.param('id') } });
    return c.body(null, 204);
});

router.delete('/books/:id', requirePermission('books'), async c => {
    const id = c.req.param('id');
    const book = await Book.findByPk(id, { attributes: ['filePath'] });
    if (!book) return c.body(null, 404);
    await Book.destroy({ where: { id } });
    await ReadingProgress.destroy({ where: { book_id: id } });
    await UserBookAccess.destroy({ where: { book_id: id } });
    [book.filePath, path.join(COVER_DIR, `${id}.jpg`)].forEach(f => { try { fs.unlinkSync(f); } catch {} });
    plugins.emit('bookDeleted', { id: Number(id), book: book.toJSON() });
    return c.body(null, 204);
});

export default router;
