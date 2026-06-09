import fs from 'fs';
import path from 'path';
import { Comic } from '../../database';
import { COVER_DIR } from '../../utils/paths';
import type { PluginContext } from '../index';

export default {
    name: 'Comic Vine',
    version: '1.0.0',

    async register({ db, router, pluginDir, render, addNavItem }: PluginContext) {
        await db.query(`
            CREATE TABLE IF NOT EXISTS comic_vine_config (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        `);

        async function getApiKey(): Promise<string | null> {
            const [[row]] = await db.query(
                `SELECT value FROM comic_vine_config WHERE key = 'api_key'`
            ) as [[{ value: string }?], unknown];
            return row?.value ?? null;
        }

        const icon = `<svg fill="none" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`;
        addNavItem({ label: 'Comic Vine', href: '/plugins/comic-vine', icon });

        // ── Settings + comic list ───────────────────────────────────────────────

        router.get('/', async c => {
            const apiKey = await getApiKey();
            const comics = await Comic.findAll({
                order: [['series', 'ASC'], ['issue', 'ASC']],
                attributes: ['id', 'title', 'series', 'issue', 'year'],
            });
            return render(c, path.join(pluginDir, 'views/index.pug'), {
                apiKey: apiKey ? '••••••••' + apiKey.slice(-4) : null,
                comics: comics.map(c => c.toJSON()),
                saved: c.req.query('saved') === '1',
            });
        });

        router.post('/settings', async c => {
            const body = await c.req.parseBody();
            const key = (body['api_key'] as string | undefined)?.trim();
            if (!key) return c.redirect('/plugins/comic-vine?saved=1');
            await db.query(
                `INSERT OR REPLACE INTO comic_vine_config (key, value) VALUES ('api_key', ?)`,
                { replacements: [key] }
            );
            return c.redirect('/plugins/comic-vine?saved=1');
        });

        // ── Per-comic lookup page ──────────────────────────────────────────────

        router.get('/lookup/:id', async c => {
            const id = Number(c.req.param('id'));
            const comic = await Comic.findByPk(id, { attributes: ['id', 'title', 'series', 'issue', 'year', 'description'] });
            if (!comic) return c.body('Not found', 404);
            const apiKey = await getApiKey();
            return render(c, path.join(pluginDir, 'views/lookup.pug'), {
                comic: comic.toJSON(),
                hasKey: !!apiKey,
                applied: c.req.query('applied') === '1',
                defaultQuery: [comic.get('series'), comic.get('issue') ? '#' + comic.get('issue') : '']
                    .filter(Boolean).join(' ') || (comic.get('title') as string),
            });
        });

        // ── CV search proxy (returns JSON) ─────────────────────────────────────

        router.get('/search', async c => {
            const q = c.req.query('q')?.trim();
            if (!q) return c.json({ error: 'No query' }, 400 as any);
            const apiKey = await getApiKey();
            if (!apiKey) return c.json({ error: 'No API key configured' }, 400 as any);

            const url = 'https://comicvine.gamespot.com/api/search/?' + new URLSearchParams({
                api_key: apiKey, format: 'json', query: q, resources: 'issue', limit: '12',
                field_list: 'id,name,issue_number,volume,cover_date,image,deck',
            });

            try {
                const res = await fetch(url, { headers: { 'User-Agent': 'Booknook/1.0' } });
                const data = await res.json() as { status_code: number; error: string; results: unknown[] };
                if (data.status_code !== 1) return c.json({ error: data.error }, 400 as any);
                return c.json({ results: data.results });
            } catch (e) {
                return c.json({ error: (e as Error).message }, 500 as any);
            }
        });

        // ── Apply CV metadata to a comic ───────────────────────────────────────

        router.post('/apply', async c => {
            const body = await c.req.parseBody();
            const comicId   = Number(body['comic_id']);
            const title     = (body['title'] as string | undefined)?.trim() || null;
            const series    = (body['series'] as string | undefined)?.trim() || null;
            const issue     = (body['issue'] as string | undefined)?.trim() || null;
            const year      = body['year'] ? parseInt(body['year'] as string, 10) || null : null;
            const desc      = (body['deck'] as string | undefined)?.trim() || null;
            const imageUrl  = (body['image_url'] as string | undefined)?.trim() || null;

            if (!comicId) return c.body('Bad request', 400);

            await Comic.update(
                { title: title ?? undefined, series: series ?? undefined,
                  issue: issue ?? undefined, year: year ?? undefined,
                  description: desc ?? undefined },
                { where: { id: comicId } }
            );

            // Download cover from Comic Vine (best-effort)
            // Allowlist guards against SSRF; redirect:manual prevents redirect to non-allowlisted hosts.
            const CV_HOSTS = new Set([
                'comicvine.gamespot.com', 'static.comicvine.com',
                'comicvine.com', 'www.comicvine.com', 'comicvine1.cbsistatic.com',
            ]);
            if (imageUrl) {
                try {
                    const u = new URL(imageUrl);
                    if (u.protocol === 'https:' && CV_HOSTS.has(u.hostname)) {
                        const res = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Booknook/1.0' } });
                        if (res.ok) {
                            const buf = Buffer.from(await res.arrayBuffer());
                            fs.mkdirSync(COVER_DIR, { recursive: true });
                            fs.writeFileSync(path.join(COVER_DIR, `c${comicId}.jpg`), buf);
                        }
                    }
                } catch { /* best effort */ }
            }

            return c.redirect('/plugins/comic-vine/lookup/' + comicId + '?applied=1');
        });
    },
};
