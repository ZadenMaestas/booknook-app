import { createMiddleware } from 'hono/factory';
import bcrypt from 'bcrypt';
import { User } from '../database';
import type { AppVariables } from '../types/index';
import type { Context } from 'hono';

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const session = c.get('session');
    if (!session?.user) return c.redirect('/login');

    const row = await User.findByPk(session.user.id, { attributes: ['id', 'is_admin', 'permissions'] });
    if (!row) {
        await session.destroy();
        return c.redirect('/login');
    }
    // Sync live DB values so admin/permission changes take effect on the next request
    session.user.isAdmin = !!row.is_admin;
    session.user.permissions = row.permissions ? (JSON.parse(row.permissions) as string[]) : null;
    await next();
});

export const requireAdmin = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!c.get('session')?.user?.isAdmin) return c.body('Forbidden', 403);
    await next();
});

export function requirePermission(section: string) {
    return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
        const user = c.get('session')?.user;
        if (!user) return c.redirect('/login');
        if (user.isAdmin) return next();
        if ((user.permissions ?? []).includes(section)) return c.redirect('/settings');
        return next();
    });
}

export async function handleLogin(c: Context<{ Variables: AppVariables }>): Promise<Response> {
    const body = await c.req.parseBody();
    const username = body['username'] as string;
    const password = body['password'] as string;

    const user = await User.findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return renderLogin(c, 'Invalid username or password');
    }

    const session = c.get('session');
    session.user = {
        id: user.id, username: user.username, isAdmin: !!user.is_admin,
        permissions: user.permissions ? (JSON.parse(user.permissions) as string[]) : null,
    };
    await session.save();
    return c.redirect('/');
}

export async function handleLogout(c: Context<{ Variables: AppVariables }>): Promise<Response> {
    await c.get('session').destroy();
    return c.redirect('/login');
}

function renderLogin(c: Context, error?: string): Response {
    const pug = require('pug') as typeof import('pug');
    const path = require('path') as typeof import('path');
    const html = pug.renderFile(path.join(__dirname, '../views/login.pug'), {
        basedir: path.join(__dirname, '..'),
        error: error ?? null,
        user: null,
        currentPath: '/login',
        dev: false,
        pluginNavItems: [],
        pluginStylesheets: [],
        pluginScripts: [],
    });
    return c.html(html);
}
