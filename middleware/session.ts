import { createMiddleware } from 'hono/factory';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'crypto';
import { Op } from 'sequelize';
import { Session } from '../database';
import type { AppVariables, SessionUser } from '../types/index';

const COOKIE = 'booknook.sid';
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60; // seconds

function makeSession(c: Parameters<Parameters<typeof createMiddleware>[0]>[0], initialId: string, initialData: { user?: SessionUser }) {
    let id = initialId;
    const data = { ...initialData };

    return {
        get user() { return data.user; },
        set user(v: SessionUser | undefined) { data.user = v; },

        async save(maxAge = DEFAULT_MAX_AGE) {
            if (!id) id = randomBytes(16).toString('hex');
            const expires = Date.now() + maxAge * 1000;
            await Session.upsert({ id, data: JSON.stringify(data), expires_at: expires });
            setCookie(c, COOKIE, id, {
                httpOnly: true,
                path: '/',
                maxAge,
                sameSite: 'Lax',
            });
        },

        async destroy() {
            if (id) await Session.destroy({ where: { id } });
            deleteCookie(c, COOKIE, { path: '/' });
            data.user = undefined;
            id = '';
        },
    };
}

export type AppSession = ReturnType<typeof makeSession>;

export default createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const sid = getCookie(c, COOKIE);
    let id = sid ?? '';
    let userData: { user?: SessionUser } = {};

    if (sid) {
        const row = await Session.findByPk(sid);
        if (row && row.expires_at > Date.now()) {
            userData = JSON.parse(row.data) as { user?: SessionUser };
        } else if (row) {
            await Session.destroy({ where: { id: sid } });
            id = '';
        }
    }

    c.set('session', makeSession(c as any, id, userData));

    if (Math.random() < 0.01) {
        Session.destroy({ where: { expires_at: { [Op.lt]: Date.now() } } }).catch(() => {});
    }

    await next();
});
