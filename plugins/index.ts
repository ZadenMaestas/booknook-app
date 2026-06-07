import fs from 'fs';
import path from 'path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import pug from 'pug';
import type { Context } from 'hono';
import type { Sequelize } from 'sequelize';
import type { NavItem, AppVariables } from '../types/index';

const DEV = process.env.NODE_ENV !== 'production';
const PLUGINS_DIR = __dirname;

export type AppHono = Hono<{ Variables: AppVariables }>;

export interface PluginContext {
    db: Sequelize;
    router: AppHono;
    pluginDir: string;
    render(c: Context<{ Variables: AppVariables }>, templatePath: string, locals?: Record<string, unknown>): Response;
    addNavItem(item: Omit<NavItem, '_plugin'>): void;
    addStylesheet(href: string): void;
    addScript(src: string): void;
    on(event: string, handler: (payload: any) => void): void;
}

interface PluginManifest {
    name: string;
    version?: string;
    register(ctx: PluginContext): void | Promise<void>;
}

class PluginRegistry {
    private _navItems: NavItem[] = [];
    private _stylesheets: string[] = [];
    private _scripts: string[] = [];
    private _hooks: Record<string, Array<(payload: any) => void>> = {};
    loaded: string[] = [];

    getLocals() {
        return {
            pluginNavItems:    this._navItems,
            pluginStylesheets: this._stylesheets,
            pluginScripts:     this._scripts,
        };
    }

    async load(app: AppHono, db: Sequelize): Promise<void> {
        const entries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });
        await Promise.all(entries.map(entry => {
            if (!entry.isDirectory()) return;
            const tsPath = path.join(PLUGINS_DIR, entry.name, 'plugin.ts');
            const jsPath = path.join(PLUGINS_DIR, entry.name, 'plugin.js');
            if (!fs.existsSync(tsPath) && !fs.existsSync(jsPath)) return;
            return this._loadOne(app, db, entry.name);
        }));
    }

    private async _loadOne(app: AppHono, db: Sequelize, name: string): Promise<void> {
        const pluginDir = path.join(PLUGINS_DIR, name);
        if (name === 'example') return;
        try {
            const tsPath = path.join(pluginDir, 'plugin.ts');
            const jsPath = path.join(pluginDir, 'plugin.js');
            const manifestPath = fs.existsSync(tsPath) ? tsPath : jsPath;
            const mod = await import(manifestPath);
            const plugin = (mod.default ?? mod) as PluginManifest;

            const router: AppHono = new Hono();
            const publicDir = path.join(pluginDir, 'public');

            if (fs.existsSync(publicDir)) {
                app.use(
                    `/plugins/${name}/static/*`,
                    serveStatic({ root: publicDir, rewriteRequestPath: p => p.replace(`/plugins/${name}/static`, '') }),
                );
                app.use(
                    `/plugins/${name}/*`,
                    serveStatic({ root: publicDir, rewriteRequestPath: p => p.replace(`/plugins/${name}`, '') }),
                );
            }

            const registry = this;
            await plugin.register({
                db,
                router,
                pluginDir,
                render(c, templatePath, locals = {}) {
                    const session = c.get('session');
                    const html = pug.renderFile(templatePath, {
                        basedir: path.resolve(PLUGINS_DIR, '..'),
                        user: session?.user ?? null,
                        currentPath: new URL(c.req.url).pathname,
                        dev: DEV,
                        ...registry.getLocals(),
                        ...locals,
                    });
                    return c.html(html);
                },
                addNavItem:    item => this._navItems.push({ ...item, _plugin: name }),
                addStylesheet: href => this._stylesheets.push(href),
                addScript:     src  => this._scripts.push(src),
                on: (event, handler) => {
                    (this._hooks[event] ??= []).push(handler);
                },
            });

            app.route(`/plugins/${name}`, router);
            this.loaded.push(name);
            console.log(`[plugin] loaded: ${name}`);
        } catch (e) {
            console.error(`[plugin] failed to load "${name}":`, (e as Error).message);
        }
    }

    emit(event: string, payload: unknown): void {
        for (const handler of (this._hooks[event] ?? [])) {
            try { handler(payload); }
            catch (e) { console.error(`[plugin] hook error (${event}):`, (e as Error).message); }
        }
    }
}

export default new PluginRegistry();
