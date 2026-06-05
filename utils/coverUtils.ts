import fs from 'fs';
import path from 'path';
import { EPub } from 'epub2';
import type { TocElement } from 'epub2/lib/epub/const';

const CACHE_DIR = path.join(__dirname, '../cache/covers');

// Resize a cover to max 300px wide, strip metadata, quality 82.
// Silently no-ops if magick isn't available or the file is already small.
async function shrink(filePath: string): Promise<void> {
    const stat = fs.statSync(filePath);
    if (stat.size <= 60_000) return; // already small enough
    const tmp = filePath + '.tmp';
    const proc = Bun.spawn(
        ['magick', filePath, '-resize', '300x>', '-strip', '-quality', '82', tmp],
        { stdout: 'ignore', stderr: 'ignore' },
    );
    const code = await proc.exited;
    if (code === 0 && fs.existsSync(tmp)) {
        fs.renameSync(tmp, filePath);
    } else {
        try { fs.unlinkSync(tmp); } catch {}
    }
}

// Called at startup — shrinks any existing oversized covers in the background.
export async function shrinkExistingCovers(): Promise<void> {
    if (!fs.existsSync(CACHE_DIR)) return;
    const large = fs.readdirSync(CACHE_DIR)
        .filter(f => f.endsWith('.jpg'))
        .filter(f => fs.statSync(path.join(CACHE_DIR, f)).size > 60_000);
    if (!large.length) return;
    // Parallel in batches of 4 to avoid spawning 20+ processes at once
    for (let i = 0; i < large.length; i += 4) {
        await Promise.all(
            large.slice(i, i + 4).map(f => shrink(path.join(CACHE_DIR, f)).catch(() => {}))
        );
    }
    console.log(`[covers] shrunk ${large.length} existing cover(s)`);
}

function getEpubImage(epub: EPub, id: string): Promise<Buffer | null> {
    return new Promise(resolve => {
        epub.getImage(id, (err, data) => {
            resolve(err || !data ? null : Buffer.from(data));
        });
    });
}

async function extractEpubCover(filePath: string): Promise<Buffer | null> {
    if (path.extname(filePath).toLowerCase() !== '.epub') return null;
    return new Promise(resolve => {
        try {
            const epub = new EPub(filePath);
            epub.on('end', async () => {
                const images: TocElement[] = Object.values(epub.manifest || {})
                    .filter(i => i['media-type']?.startsWith('image/'));

                const candidates: TocElement[] = [];
                if (epub.metadata.cover) {
                    const meta = images.find(i => i.id === epub.metadata.cover);
                    if (meta) candidates.push(meta);
                }
                const coverNamed = images.find(i =>
                    i.id?.toLowerCase().includes('cover') || i.href?.toLowerCase().includes('cover')
                );
                if (coverNamed && !candidates.includes(coverNamed)) candidates.push(coverNamed);
                for (const img of images) {
                    if (!candidates.includes(img)) candidates.push(img);
                }

                for (const item of candidates) {
                    if (!item.id) continue;
                    const buf = await getEpubImage(epub, item.id);
                    if (buf && buf.length >= 10000) { resolve(buf); return; }
                }
                resolve(null);
            });
            epub.on('error', () => resolve(null));
            epub.parse();
        } catch { resolve(null); }
    });
}

export async function fetchAndCacheCover(
    bookId: number,
    isbn: string | null | undefined,
    title: string | null,
    filePath: string | null,
    coverId?: number | null,
): Promise<void> {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const dest = path.join(CACHE_DIR, `${bookId}.jpg`);

    if (filePath) {
        const cover = await extractEpubCover(filePath);
        if (cover) {
            fs.writeFileSync(dest, cover);
            shrink(dest).catch(() => {});
            return;
        }
    }

    const urls: string[] = [];
    if (coverId) urls.push(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg`);
    if (isbn)    urls.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`);
    if (title)   urls.push(`https://covers.openlibrary.org/b/title/${encodeURIComponent(title)}-M.jpg`);

    for (const url of urls) {
        try {
            const res = await fetch(url);
            if (!res.ok) continue;
            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length < 1000) continue;
            fs.writeFileSync(dest, buffer);
            shrink(dest).catch(() => {});
            return;
        } catch { continue; }
    }
}
