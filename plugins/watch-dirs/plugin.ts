import fs from 'fs';
import path from 'path';
import { Comic, Book } from '../../database';
import { resolveComicMeta, saveComicCover } from '../../utils/comicImport';
import { resolveBookMeta, saveBookCover, BOOK_EXTS } from '../../utils/bookImport';
import type { PluginContext } from '../index';

const COMIC_EXTS = new Set(['.cbz', '.cbr']);

type WatchRow = { id: number; path: string; type: 'comics' | 'books'; enabled: number };
type LogRow   = { id: number; dir_id: number; filename: string; status: string; error: string | null; imported_at: string; dir_path: string | null };

// Module-level map survives across requests
const watchers = new Map<number, fs.FSWatcher>();

export default {
    name: 'Watch Directories',
    version: '1.0.0',

    async register({ db, router, pluginDir, render, addNavItem }: PluginContext) {
        await db.query(`
            CREATE TABLE IF NOT EXISTS watch_dirs (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                path       TEXT NOT NULL UNIQUE,
                type       TEXT NOT NULL CHECK(type IN ('comics','books')),
                enabled    INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.query(`
            CREATE TABLE IF NOT EXISTS watch_import_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                dir_id      INTEGER NOT NULL,
                filename    TEXT NOT NULL,
                status      TEXT NOT NULL,
                error       TEXT,
                imported_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        async function addLog(dirId: number, filename: string, status: string, error?: string) {
            await db.query(
                `INSERT INTO watch_import_log (dir_id, filename, status, error) VALUES (?, ?, ?, ?)`,
                { replacements: [dirId, filename, status, error ?? null] }
            );
        }

        async function importComic(filePath: string, dirId: number) {
            const filename = path.basename(filePath);
            const ext = path.extname(filename).toLowerCase();
            if (!COMIC_EXTS.has(ext) || filename.startsWith('.')) return;

            const existing = await Comic.findOne({ where: { filePath } });

            if (existing) {
                // Replace if the file on disk is newer than the last time we imported it
                let stat: fs.Stats;
                try { stat = fs.statSync(filePath); } catch { return; }
                const [[logRow]] = await db.query(
                    `SELECT imported_at FROM watch_import_log WHERE dir_id = ? AND filename = ? AND status IN ('imported','updated') ORDER BY imported_at DESC LIMIT 1`,
                    { replacements: [dirId, filename] }
                ) as [[{ imported_at: string } | undefined], unknown];
                if (!logRow) return;
                const lastImportMs = new Date(logRow.imported_at.replace(' ', 'T') + 'Z').getTime();
                if (stat.mtimeMs <= lastImportMs) return;

                try {
                    const meta = await resolveComicMeta(filePath);
                    await existing.update(meta);
                    await saveComicCover(existing.id, filePath);
                    console.log(`[watch-dirs] updated comic: ${filename}`);
                    await addLog(dirId, filename, 'updated');
                } catch (e) {
                    const msg = (e as Error).message;
                    console.error(`[watch-dirs] failed update comic: ${filename}`, msg);
                    await addLog(dirId, filename, 'error', msg);
                }
                return;
            }

            try {
                const meta = await resolveComicMeta(filePath);
                const [comic, created] = await Comic.findOrCreate({
                    where: { filePath },
                    defaults: meta as any,
                });
                if (created) {
                    await saveComicCover(comic.id, filePath);
                    console.log(`[watch-dirs] imported comic: ${filename}`);
                    await addLog(dirId, filename, 'imported');
                }
            } catch (e) {
                const msg = (e as Error).message;
                console.error(`[watch-dirs] failed comic: ${filename}`, msg);
                await addLog(dirId, filename, 'error', msg);
            }
        }

        async function importBook(filePath: string, dirId: number) {
            const filename = path.basename(filePath);
            const ext = path.extname(filename).toLowerCase();
            if (!BOOK_EXTS.has(ext) || filename.startsWith('.')) return;

            const existing = await Book.findOne({ where: { filePath } });

            if (existing) {
                let stat: fs.Stats;
                try { stat = fs.statSync(filePath); } catch { return; }
                const [[logRow]] = await db.query(
                    `SELECT imported_at FROM watch_import_log WHERE dir_id = ? AND filename = ? AND status IN ('imported','updated') ORDER BY imported_at DESC LIMIT 1`,
                    { replacements: [dirId, filename] }
                ) as [[{ imported_at: string } | undefined], unknown];
                if (!logRow) return;
                const lastImportMs = new Date(logRow.imported_at.replace(' ', 'T') + 'Z').getTime();
                if (stat.mtimeMs <= lastImportMs) return;

                try {
                    const meta = await resolveBookMeta(filePath);
                    await existing.update({ title: meta.title, author: meta.author, isbn: meta.isbn });
                    await saveBookCover(existing.id, meta, filePath);
                    console.log(`[watch-dirs] updated book: ${filename}`);
                    await addLog(dirId, filename, 'updated');
                } catch (e) {
                    const msg = (e as Error).message;
                    console.error(`[watch-dirs] failed update book: ${filename}`, msg);
                    await addLog(dirId, filename, 'error', msg);
                }
                return;
            }

            try {
                const meta = await resolveBookMeta(filePath);
                const [book, created] = await Book.findOrCreate({
                    where: { filePath },
                    defaults: { title: meta.title, author: meta.author, isbn: meta.isbn },
                });
                if (created) {
                    await saveBookCover(book.id, meta, filePath);
                    console.log(`[watch-dirs] imported book: ${filename}`);
                    await addLog(dirId, filename, 'imported');
                }
            } catch (e) {
                const msg = (e as Error).message;
                console.error(`[watch-dirs] failed book: ${filename}`, msg);
                await addLog(dirId, filename, 'error', msg);
            }
        }

        async function scanDir(row: WatchRow) {
            if (!fs.existsSync(row.path)) return;
            let entries: fs.Dirent[];
            try { entries = fs.readdirSync(row.path, { withFileTypes: true }); }
            catch (e) { console.error(`[watch-dirs] scan failed on "${row.path}":`, (e as Error).message); return; }
            for (const entry of entries) {
                if (!entry.isFile()) continue;
                const filePath = path.join(row.path, entry.name);
                if (row.type === 'comics') await importComic(filePath, row.id);
                else await importBook(filePath, row.id);
            }
        }

        function startWatcher(row: WatchRow) {
            if (watchers.has(row.id)) return;
            if (!fs.existsSync(row.path)) {
                console.warn(`[watch-dirs] path not found, skipping watch: "${row.path}"`);
                return;
            }
            try {
                const watcher = fs.watch(row.path, (event, filename) => {
                    if (event !== 'rename' || !filename) return;
                    // delay lets the writer finish and avoids acting on deletions
                    setTimeout(async () => {
                        const filePath = path.join(row.path, filename);
                        try {
                            if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
                        } catch { return; }
                        if (row.type === 'comics') await importComic(filePath, row.id);
                        else await importBook(filePath, row.id);
                    }, 1500);
                });
                watcher.on('error', e => {
                    console.error(`[watch-dirs] watcher error on "${row.path}":`, (e as Error).message);
                    watchers.delete(row.id);
                });
                watchers.set(row.id, watcher);
                console.log(`[watch-dirs] watching "${row.path}" (${row.type})`);
            } catch (e) {
                console.error(`[watch-dirs] could not watch "${row.path}":`, (e as Error).message);
            }
        }

        function stopWatcher(id: number) {
            watchers.get(id)?.close();
            watchers.delete(id);
        }

        // On boot: start all enabled watchers and catch files added while server was down
        const [bootRows] = await db.query(
            `SELECT id, path, type, enabled FROM watch_dirs WHERE enabled = 1`
        ) as [WatchRow[], unknown];
        for (const row of bootRows) {
            startWatcher(row);
            scanDir(row).catch(console.error);
        }

        // ── Nav ────────────────────────────────────────────────────────────────

        const icon = `<svg fill="currentColor" width="18" height="18" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
        addNavItem({ label: 'Watch Dirs', href: '/plugins/watch-dirs', icon });

        // ── Routes ─────────────────────────────────────────────────────────────

        router.get('/', async c => {
            const [dirs] = await db.query(
                `SELECT id, path, type, enabled, created_at FROM watch_dirs ORDER BY created_at DESC`
            ) as [WatchRow[], unknown];
            const [logs] = await db.query(`
                SELECT l.*, d.path as dir_path
                FROM watch_import_log l
                LEFT JOIN watch_dirs d ON d.id = l.dir_id
                ORDER BY l.imported_at DESC LIMIT 100
            `) as [LogRow[], unknown];
            return render(c, path.join(pluginDir, 'views/index.pug'), {
                dirs,
                logs,
                activeIds: [...watchers.keys()],
                error: c.req.query('error') || null,
            });
        });

        router.post('/add', async c => {
            const body    = await c.req.parseBody();
            const dirPath = (body['path'] as string | undefined)?.trim();
            const type    = body['type'] as string;
            if (!dirPath || !['comics', 'books'].includes(type))
                return c.redirect('/plugins/watch-dirs?error=invalid');
            if (!fs.existsSync(dirPath))
                return c.redirect('/plugins/watch-dirs?error=notfound');
            try {
                await db.query(
                    `INSERT INTO watch_dirs (path, type) VALUES (?, ?)`,
                    { replacements: [dirPath, type] }
                );
                const [[rowid]] = await db.query(`SELECT last_insert_rowid() as id`) as [[{ id: number }], unknown];
                const row: WatchRow = { id: rowid.id, path: dirPath, type: type as 'comics' | 'books', enabled: 1 };
                startWatcher(row);
                scanDir(row).catch(console.error);
            } catch {
                return c.redirect('/plugins/watch-dirs?error=exists');
            }
            return c.redirect('/plugins/watch-dirs');
        });

        router.post('/toggle/:id', async c => {
            const id = Number(c.req.param('id'));
            const [[row]] = await db.query(
                `SELECT id, path, type, enabled FROM watch_dirs WHERE id = ?`,
                { replacements: [id] }
            ) as [WatchRow[], unknown];
            if (!row) return c.body(null, 404);
            const enabling = !watchers.has(id);
            await db.query(`UPDATE watch_dirs SET enabled = ? WHERE id = ?`, { replacements: [enabling ? 1 : 0, id] });
            if (enabling) {
                startWatcher(row);
                scanDir(row).catch(console.error);
            } else {
                stopWatcher(id);
            }
            return c.redirect('/plugins/watch-dirs');
        });

        router.post('/scan/:id', async c => {
            const id = Number(c.req.param('id'));
            const [[row]] = await db.query(
                `SELECT id, path, type, enabled FROM watch_dirs WHERE id = ?`,
                { replacements: [id] }
            ) as [WatchRow[], unknown];
            if (!row) return c.body(null, 404);
            scanDir(row).catch(console.error);
            return c.redirect('/plugins/watch-dirs');
        });

        router.post('/delete/:id', async c => {
            const id = Number(c.req.param('id'));
            stopWatcher(id);
            await db.query(`DELETE FROM watch_dirs WHERE id = ?`, { replacements: [id] });
            await db.query(`DELETE FROM watch_import_log WHERE dir_id = ?`, { replacements: [id] });
            return c.redirect('/plugins/watch-dirs');
        });
    },
};
