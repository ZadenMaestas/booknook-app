import { sequelize } from '../database';

export interface MigrationStatus {
    id: string;
    name: string;
    status: 'applied' | 'pending' | 'failed';
    applied_at: string | null;
    error?: string;
}

interface Migration {
    id: string;
    name: string;
    up: string;
    detect?: () => Promise<boolean>;
}

const MIGRATIONS: Migration[] = [
    {
        id: '001_comics_year',
        name: 'Add year column to comics',
        up: 'ALTER TABLE comics ADD COLUMN year INTEGER',
        detect: async () => {
            const [rows] = await sequelize.query("SELECT COUNT(*) as n FROM pragma_table_info('comics') WHERE name='year'");
            return (rows[0] as { n: number }).n > 0;
        },
    },
    {
        id: '002_api_keys',
        name: 'Create api_keys table',
        up: `CREATE TABLE IF NOT EXISTS api_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  key        TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
)`,
        detect: async () => {
            const [rows] = await sequelize.query("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='api_keys'");
            return (rows[0] as { n: number }).n > 0;
        },
    },
    {
        id: '003_user_permissions',
        name: 'Add permissions column to users',
        up: 'ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL',
        detect: async () => {
            const [rows] = await sequelize.query("SELECT COUNT(*) as n FROM pragma_table_info('users') WHERE name='permissions'");
            return (rows[0] as { n: number }).n > 0;
        },
    },
    {
        id: '004_reading_progress_page',
        name: 'Add page column to reading_progress',
        up: 'ALTER TABLE reading_progress ADD COLUMN page INTEGER NOT NULL DEFAULT 0',
        detect: async () => {
            const [rows] = await sequelize.query("SELECT COUNT(*) as n FROM pragma_table_info('reading_progress') WHERE name='page'");
            return (rows[0] as { n: number }).n > 0;
        },
    },
];

await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
)`);

for (const m of MIGRATIONS) {
    if (!m.detect) continue;
    const [tracked] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = ?', { replacements: [m.id] });
    if (!tracked.length && await m.detect()) {
        await sequelize.query('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)', { replacements: [m.id] });
    }
}

export async function getMigrationStatus(): Promise<MigrationStatus[]> {
    const [rows] = await sequelize.query('SELECT id, applied_at FROM schema_migrations') as [{ id: string; applied_at: string }[], unknown];
    const applied = new Map(rows.map(r => [r.id, r.applied_at]));
    return MIGRATIONS.map(m => ({
        id: m.id,
        name: m.name,
        status: applied.has(m.id) ? 'applied' : 'pending',
        applied_at: applied.get(m.id) ?? null,
    }));
}

export async function runPendingMigrations(): Promise<Array<{ id: string; name: string; success: boolean; error?: string }>> {
    const [rows] = await sequelize.query('SELECT id FROM schema_migrations') as [{ id: string }[], unknown];
    const applied = new Set(rows.map(r => r.id));
    const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];
    for (const m of MIGRATIONS) {
        if (applied.has(m.id)) continue;
        try {
            await sequelize.query(m.up);
            await sequelize.query('INSERT INTO schema_migrations (id) VALUES (?)', { replacements: [m.id] });
            results.push({ id: m.id, name: m.name, success: true });
        } catch (e) {
            results.push({ id: m.id, name: m.name, success: false, error: (e as Error).message });
            break;
        }
    }
    return results;
}
