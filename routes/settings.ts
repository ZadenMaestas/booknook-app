import { Hono } from 'hono';
import bcrypt from 'bcrypt';
import { User, ApiKey } from '../database';
import { render } from '../utils/render';
import { getMigrationStatus } from '../utils/migrationRunner';
import type { AppVariables } from '../types';

const router = new Hono<{ Variables: AppVariables }>();

router.get('/settings', async c => {
    const isAdmin = c.get('session').user!.isAdmin;
    const users      = isAdmin ? await User.findAll({ attributes: ['id', 'username', 'created_at', 'permissions'] }) : null;
    const apiKeys    = isAdmin ? await ApiKey.findAll({ order: [['created_at', 'DESC']] }) : null;
    const migrations = isAdmin ? await getMigrationStatus() : null;
    return render(c, 'settings', { saved: false, users, apiKeys, migrations, userError: c.req.query('error') || null });
});

router.post('/settings/password', async c => {
    const body = await c.req.parseBody();
    const current = body['current'] as string;
    const newPass  = body['next'] as string;
    const confirm  = body['confirm'] as string;
    if (newPass !== confirm) return render(c, 'settings', { error: 'Passwords do not match', saved: false });
    const user = await User.findByPk(c.get('session').user!.id);
    if (!user) return render(c, 'settings', { error: 'User not found', saved: false });
    if (!(await bcrypt.compare(current, user.password_hash)))
        return render(c, 'settings', { error: 'Current password is incorrect', saved: false });
    const hash = await bcrypt.hash(newPass, 10);
    await User.update({ password_hash: hash }, { where: { id: user.id } });
    return render(c, 'settings', { saved: true });
});

export default router;
