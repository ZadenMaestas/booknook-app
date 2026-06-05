import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'crypto';
import db from '../database';
import type { Session, AppVariables, SessionUser } from '../types/index';

const COOKIE = 'booknook.sid';
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // seconds

interface SessionRow {
    data: string;
    expires_at: number;
}

function makeSession(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], initialId: string, initialData: { user?: SessionUser }): Session {
    let id = initialId;
    const data = { ...initialData };

    return {
        get user() { return data.user; },
        set user(v: SessionUser | undefined) { data.user = v; },

        save(maxAge = DEFAULT_MAX_AGE) {
            if (!id) id = randomBytes(16).toString('hex');
            const expires = Date.now() + maxAge * 1000;
            db.prepare('INSERT OR REPLACE INTO sessions (id, data, expires_at) VALUES (?, ?, ?)')
                .run(id, JSON.stringify(data), expires);
            setCookie(c, COOKIE, id, {
                httpOnly: true,
                path: '/',
                maxAge,
                sameSite: 'Lax',
            });
        },

        destroy() {
            if (id) db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
            deleteCookie(c, COOKIE, { path: '/' });
            data.user = undefined;
            id = '';
        },
    };
}

export default createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const sid = getCookie(c, COOKIE);
    let id = sid ?? '';
    let userData: { user?: SessionUser } = {};

    if (sid) {
        const row = db.prepare('SELECT data, expires_at FROM sessions WHERE id = ?')
            .get(sid) as SessionRow | null;
        if (row && row.expires_at > Date.now()) {
            userData = JSON.parse(row.data) as { user?: SessionUser };
        } else if (row) {
            db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
            id = '';
        }
    }

    c.set('session', makeSession(c as any, id, userData));

    // Periodically clean up expired sessions
    if (Math.random() < 0.01) {
        db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    }

    await next();
});
