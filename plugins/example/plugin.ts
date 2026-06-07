import path from 'path';
import type { PluginContext } from '../index';

interface Note {
    id: number;
    book_id: number;
    note: string;
    created_at: string;
    bookTitle?: string;
}

export default {
    name: 'example',
    version: '1.0.0',

    async register({ db, router, pluginDir, render, addNavItem, addStylesheet, addScript, on }: PluginContext) {
        await db.query(`CREATE TABLE IF NOT EXISTS example_notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id    INTEGER NOT NULL,
            note       TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`);

        addNavItem({
            label: 'Notes',
            href: '/plugins/example',
            icon: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
        });

        addStylesheet('/plugins/example/styles.css');
        addScript('/plugins/example/client.js');

        router.get('/', async c => {
            const [notes] = await db.query(`
                SELECT n.*, b.title as bookTitle
                FROM example_notes n
                LEFT JOIN books b ON b.id = n.book_id
                ORDER BY n.created_at DESC
            `) as [Note[], unknown];
            return render(c, path.join(pluginDir, 'views/index.pug'), { notes });
        });

        router.post('/notes', async c => {
            const body = await c.req.parseBody();
            const book_id = Number(body['book_id']);
            const note = (body['note'] as string)?.trim();
            if (!book_id || !note) return c.json({ error: 'book_id and note required' }, 400);
            const [, meta] = await db.query(
                'INSERT INTO example_notes (book_id, note) VALUES (?, ?)',
                { replacements: [book_id, note] }
            ) as [unknown, { lastID?: number }];
            return c.json({ id: meta?.lastID ?? null }, 201);
        });

        router.delete('/notes/:id', async c => {
            await db.query('DELETE FROM example_notes WHERE id = ?', { replacements: [c.req.param('id')] });
            return c.body(null, 204);
        });

        on('bookDeleted', ({ id }: { id: number }) => {
            db.query('DELETE FROM example_notes WHERE book_id = ?', { replacements: [id] }).catch(console.error);
        });
    },
};
