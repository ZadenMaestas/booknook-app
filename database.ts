import 'dotenv/config';
import { Sequelize, DataTypes, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import path from 'path';

const dbPath = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'booknook.db')
    : 'booknook.db';

export const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false,
});

// ── Models ────────────────────────────────────────────────────────────────────

export class User extends Model {
    declare id: number;
    declare username: string;
    declare password_hash: string;
    declare is_admin: number;
    declare permissions: string | null;
    declare created_at: string;
}
User.init({
    id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username:      { type: DataTypes.TEXT, allowNull: false, unique: true },
    password_hash: { type: DataTypes.TEXT, allowNull: false },
    is_admin:      { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    permissions:   { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    created_at:    { type: DataTypes.TEXT },
}, { sequelize, tableName: 'users', timestamps: false });

export class Session extends Model {
    declare id: string;
    declare data: string;
    declare expires_at: number;
}
Session.init({
    id:         { type: DataTypes.TEXT, primaryKey: true },
    data:       { type: DataTypes.TEXT, allowNull: false },
    expires_at: { type: DataTypes.INTEGER, allowNull: false },
}, { sequelize, tableName: 'sessions', timestamps: false });

export class Book extends Model {
    declare id: number;
    declare title: string;
    declare author: string | null;
    declare isbn: string | null;
    declare filePath: string;
    declare status: string;
    declare created_at: string;
}
Book.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title:      { type: DataTypes.TEXT, allowNull: false },
    author:     { type: DataTypes.TEXT },
    isbn:       { type: DataTypes.TEXT, unique: true },
    filePath:   { type: DataTypes.TEXT, unique: true },
    status:     { type: DataTypes.TEXT, defaultValue: 'none' },
    created_at: { type: DataTypes.TEXT },
}, { sequelize, tableName: 'books', timestamps: false });

export class Comic extends Model {
    declare id: number;
    declare title: string;
    declare series: string | null;
    declare issue: string | null;
    declare year: number | null;
    declare filePath: string;
    declare pageCount: number;
    declare status: string;
    declare description: string | null;
    declare created_at: string;
}
Comic.init({
    id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title:       { type: DataTypes.TEXT, allowNull: false },
    series:      { type: DataTypes.TEXT },
    issue:       { type: DataTypes.TEXT },
    year:        { type: DataTypes.INTEGER },
    filePath:    { type: DataTypes.TEXT, unique: true },
    pageCount:   { type: DataTypes.INTEGER, defaultValue: 0 },
    status:      { type: DataTypes.TEXT, defaultValue: 'none' },
    description: { type: DataTypes.TEXT },
    created_at:  { type: DataTypes.TEXT },
}, { sequelize, tableName: 'comics', timestamps: false });

export class ComicSeries extends Model {
    declare name: string;
    declare description: string | null;
}
ComicSeries.init({
    name:        { type: DataTypes.TEXT, primaryKey: true },
    description: { type: DataTypes.TEXT },
}, { sequelize, tableName: 'comic_series', timestamps: false });

export class ApiKey extends Model {
    declare id: number;
    declare name: string;
    declare key: string;
    declare created_at: string;
}
ApiKey.init({
    id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name:       { type: DataTypes.TEXT, allowNull: false },
    key:        { type: DataTypes.TEXT, allowNull: false, unique: true },
    created_at: { type: DataTypes.TEXT },
}, { sequelize, tableName: 'api_keys', timestamps: false });

export class ComicProgress extends Model {
    declare user_id: number;
    declare comic_id: number;
    declare page: number;
}
ComicProgress.init({
    user_id:  { type: DataTypes.INTEGER, primaryKey: true },
    comic_id: { type: DataTypes.INTEGER, primaryKey: true },
    page:     { type: DataTypes.INTEGER, defaultValue: 0 },
}, { sequelize, tableName: 'comic_progress', timestamps: false });

export class ReadingProgress extends Model {
    declare user_id: number;
    declare book_id: number;
    declare cfi: string | null;
    declare percentage: number;
    declare page: number;
    declare updated_at: string;
}
ReadingProgress.init({
    user_id:    { type: DataTypes.INTEGER, primaryKey: true },
    book_id:    { type: DataTypes.INTEGER, primaryKey: true },
    cfi:        { type: DataTypes.TEXT },
    percentage: { type: DataTypes.REAL, defaultValue: 0 },
    page:       { type: DataTypes.INTEGER, defaultValue: 0 },
    updated_at: { type: DataTypes.TEXT },
}, { sequelize, tableName: 'reading_progress', timestamps: false });

export class UserBookAccess extends Model {
    declare user_id: number;
    declare book_id: number;
}
UserBookAccess.init({
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    book_id: { type: DataTypes.INTEGER, primaryKey: true },
}, { sequelize, tableName: 'user_book_access', timestamps: false });

export class UserComicAccess extends Model {
    declare user_id: number;
    declare comic_id: number;
}
UserComicAccess.init({
    user_id: { type: DataTypes.INTEGER, primaryKey: true },
    comic_id: { type: DataTypes.INTEGER, primaryKey: true },
}, { sequelize, tableName: 'user_comic_access', timestamps: false });

// ── Bootstrap ─────────────────────────────────────────────────────────────────

await sequelize.query('PRAGMA journal_mode=WAL');
await sequelize.query('PRAGMA synchronous=NORMAL');
await sequelize.query('PRAGMA busy_timeout=5000');
await sequelize.query('PRAGMA cache_size=-16000');

await sequelize.sync(); // creates new tables only

// Auto-add missing columns without recreating tables (alter:true recreates tables,
// which breaks SQLite composite PKs like comic_progress)
for (const model of Object.values(sequelize.models)) {
    const tableName = model.getTableName() as string;
    const [rows] = await sequelize.query(`PRAGMA table_info("${tableName}")`);
    const existing = new Set((rows as Array<{ name: string }>).map(r => r.name));
    for (const [attrName, def] of Object.entries(model.rawAttributes)) {
        const col: string = (def as any).field ?? attrName;
        if (existing.has(col) || (def as any).primaryKey) continue;
        const typeSql: string = (def as any).type?.toSql?.() ?? 'TEXT';
        await sequelize.query(`ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${typeSql}`).catch(() => {});
    }
}

const adminUser = process.env.ADMIN_USERNAME;
const adminPass = process.env.ADMIN_PASSWORD;
if (adminUser && adminPass) {
    const existing = await User.findOne({ where: { username: adminUser } });
    if (!existing) {
        const hash = bcrypt.hashSync(adminPass, 10);
        await User.create({ username: adminUser, password_hash: hash, is_admin: 1 });
        console.log(`Admin user "${adminUser}" created`);
    }
}

export default sequelize;
