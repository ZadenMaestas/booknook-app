import path from 'path';
import { Comic, ComicProgress } from '../../database';
import type { PluginContext } from '../index';

export default {
    name: 'Panel Reader',
    version: '1.0.0',

    async register({ router, pluginDir, render, addNavItem, addScript }: PluginContext) {
        const icon = `<svg fill="none" width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="9" height="8" rx="1"/><rect x="13" y="3" width="9" height="8" rx="1"/><rect x="2" y="13" width="9" height="8" rx="1"/><rect x="13" y="13" width="9" height="8" rx="1"/></svg>`;
        addNavItem({ label: 'Panel Mode', href: '/comics', icon });
        addScript('/plugins/panel-reader/inject.js');

        router.get('/read/:id', async c => {
            const id = Number(c.req.param('id'));
            const comic = await Comic.findByPk(id);
            if (!comic) return c.body('Not found', 404);
            const session = c.get('session');
            const progress = session?.user
                ? await ComicProgress.findOne({ where: { user_id: session.user.id, comic_id: id } })
                : null;
            const savedPage = (progress?.get('page') as number) ?? 0;
            return render(c, path.join(pluginDir, 'views/reader.pug'), {
                comic: comic.toJSON(),
                savedPage,
            });
        });
    },
};
