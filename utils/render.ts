import path from 'path';
import pug from 'pug';
import type { Context } from 'hono';
import type { AppVariables } from '../types';
import plugins from '../plugins';

const BASEDIR = path.resolve(__dirname, '..');

export function render(c: Context<{ Variables: AppVariables }>, template: string, locals: Record<string, unknown> = {}): Response {
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
