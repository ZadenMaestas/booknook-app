import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import bcrypt from 'bcrypt';
import db from '../database';
import type { AppVariables, DbUser } from '../types/index';
import type { Context } from 'hono';

export const requireAuth = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const session = c.get('session');
    if (!session?.user) return c.redirect('/login');

    const row = db.prepare('SELECT id, is_admin FROM users WHERE id = ?')
        .get(session.user.id) as Pick<DbUser, 'id' | 'is_admin'> | null;
    if (!row) {
        session.destroy();
        return c.redirect('/login');
    }
    if (!!row.is_admin !== session.user.isAdmin) {
        session.user.isAdmin = !!row.is_admin;
    }
    await next();
});

export const requireAdmin = createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    if (!c.get('session')?.user?.isAdmin) return c.body('Forbidden', 403);
    await next();
});

export async function handleLogin(c: Context<{ Variables: AppVariables }>): Promise<Response> {
    const body = await c.req.parseBody();
    const username = body['username'] as string;
    const password = body['password'] as string;

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | null;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return renderLogin(c, 'Invalid username or password');
    }

    const session = c.get('session');
    session.user = { id: user.id, username: user.username, isAdmin: !!user.is_admin };
    session.save();
    return c.redirect('/');
}

export function handleLogout(c: Context<{ Variables: AppVariables }>): Response {
    c.get('session').destroy();
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
