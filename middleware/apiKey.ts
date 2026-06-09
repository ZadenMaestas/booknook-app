import { ApiKey } from '../database';
import type { Context } from 'hono';
import type { AppVariables } from '../types';

export async function requireApiKey(c: Context<{ Variables: AppVariables }>, next: () => Promise<Response | void>) {
    const provided = c.req.header('X-API-Key');
    if (!provided) return c.body('Unauthorized', 401);
    const dbMatch = await ApiKey.findOne({ where: { key: provided }, attributes: ['id'] });
    if (dbMatch) return next();
    const envKey = process.env.INGEST_API_KEY;
    if (envKey && provided === envKey) return next();
    return c.body('Unauthorized', 401);
}
