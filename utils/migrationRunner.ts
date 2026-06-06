import db from '../database';

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
    // Returns true if already applied (for installs predating this system)
    detect?: () => boolean;
}

const MIGRATIONS: Migration[] = [
    {
        id: '001_comics_year',
        name: 'Add year column to comics',
        up: 'ALTER TABLE comics ADD COLUMN year INTEGER',
        detect: () => {
            const row = db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('comics') WHERE name='year'").get() as { n: number };
            return row.n > 0;
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
        detect: () => {
            const row = db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='api_keys'").get() as { n: number };
            return row.n > 0;
        },
    },
];

db.prepare(`CREATE TABLE IF NOT EXISTS schema_migrations (
  id         TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT CURRENT_TIMESTAMP
)`).run();

// Auto-detect migrations that were applied before this system existed
for (const m of MIGRATIONS) {
    if (!m.detect) continue;
    const tracked = db.prepare('SELECT id FROM schema_migrations WHERE id = ?').get(m.id);
    if (!tracked && m.detect()) {
        db.prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)').run(m.id);
    }
}

export function getMigrationStatus(): MigrationStatus[] {
    const applied = new Map<string, string>();
    for (const row of db.prepare('SELECT id, applied_at FROM schema_migrations').all() as { id: string; applied_at: string }[]) {
        applied.set(row.id, row.applied_at);
    }
    return MIGRATIONS.map(m => ({
        id: m.id,
        name: m.name,
        status: applied.has(m.id) ? 'applied' : 'pending',
        applied_at: applied.get(m.id) ?? null,
    }));
}

export function runPendingMigrations(): Array<{ id: string; name: string; success: boolean; error?: string }> {
    const applied = new Set(
        (db.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map(r => r.id)
    );
    const results: Array<{ id: string; name: string; success: boolean; error?: string }> = [];
    for (const m of MIGRATIONS) {
        if (applied.has(m.id)) continue;
        try {
            db.prepare(m.up).run();
            db.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(m.id);
            results.push({ id: m.id, name: m.name, success: true });
        } catch (e) {
            results.push({ id: m.id, name: m.name, success: false, error: (e as Error).message });
            break; // stop on first failure — later migrations may depend on this one
        }
    }
    return results;
}
