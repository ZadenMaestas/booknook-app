import fs from 'fs';
import path from 'path';
import { EPub } from 'epub2';
import type { TocElement } from 'epub2/lib/epub/const';
import { Book, Comic } from '../database';
import { extractCover } from './cbzUtils';
import { pdfFirstPageAsJpeg } from './convertUtils';
import { COVER_DIR } from './paths';

const COVER_FILE = /^c?\d+\.jpg$/;

// Resize a cover to max 300px wide, strip metadata, quality 82.
// Silently no-ops if magick isn't available or the file is already small.
async function shrink(filePath: string): Promise<void> {
    let size = 0;
    try { size = fs.statSync(filePath).size; } catch { return; }
    if (size <= 60_000) return; // already small enough
    const tmp = `${filePath}.tmp.jpg`; // .jpg suffix so ImageMagick never has to guess the output format
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

// Atomic write + background shrink — a crash mid-write must never leave a
// truncated file masquerading as a cached cover.
export function cacheCoverBuffer(dest: string, buf: Buffer): void {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.part`;
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, dest);
    shrink(dest).catch(() => {});
}

// Called at startup — clears write leftovers and shrinks any oversized covers.
export async function shrinkExistingCovers(): Promise<void> {
    if (!fs.existsSync(COVER_DIR)) return;
    const entries = fs.readdirSync(COVER_DIR);
    for (const f of entries) {
        if (f.endsWith('.part') || f.endsWith('.tmp.jpg')) {
            try { fs.unlinkSync(path.join(COVER_DIR, f)); } catch {}
        }
    }
    const large = entries
        .filter(f => COVER_FILE.test(f))
        .filter(f => {
            try { return fs.statSync(path.join(COVER_DIR, f)).size > 60_000; }
            catch { return false; }
        });
    if (!large.length) return;
    // Parallel in batches of 4 to avoid spawning 20+ processes at once
    for (let i = 0; i < large.length; i += 4) {
        await Promise.all(
            large.slice(i, i + 4).map(f => shrink(path.join(COVER_DIR, f)).catch(() => {}))
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

                // Prefer images big enough to clearly be a cover; books with only
                // small covers still beat falling through to a failed network fetch.
                for (const minSize of [10_000, 1_500]) {
                    for (const item of candidates) {
                        if (!item.id) continue;
                        const buf = await getEpubImage(epub, item.id);
                        if (buf && buf.length >= minSize) { resolve(buf); return; }
                    }
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
): Promise<boolean> {
    const dest = path.join(COVER_DIR, `${bookId}.jpg`);

    if (filePath && fs.existsSync(filePath)) {
        const cover = await extractEpubCover(filePath);
        if (cover) {
            cacheCoverBuffer(dest, cover);
            return true;
        }
    }

    // ?default=false → 404 instead of a tiny placeholder image when no cover exists
    const urls: string[] = [];
    if (coverId) urls.push(`https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`);
    if (isbn)    urls.push(`https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`);
    if (title)   urls.push(`https://covers.openlibrary.org/b/title/${encodeURIComponent(title)}-M.jpg?default=false`);

    for (const url of urls) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
            if (!res.ok) continue;
            const type = res.headers.get('content-type') ?? '';
            if (type && !type.startsWith('image/')) continue;
            const buffer = Buffer.from(await res.arrayBuffer());
            if (buffer.length < 1000) continue;
            cacheCoverBuffer(dest, buffer);
            return true;
        } catch { continue; }
    }
    return false;
}

// Imports fetch covers exactly once, so anything transient — no network at
// import time, OpenLibrary down, a wiped or freshly-mounted cache volume —
// used to lose the cover forever. Re-derive missing covers from local files,
// falling back to OpenLibrary for books.
export async function backfillMissingCovers(): Promise<void> {
    const [books, comics] = await Promise.all([
        Book.findAll({ attributes: ['id', 'isbn', 'title', 'filePath'] }),
        Comic.findAll({ attributes: ['id', 'filePath'] }),
    ]);
    const missingBooks  = books.filter(b => !fs.existsSync(path.join(COVER_DIR, `${b.id}.jpg`)));
    const missingComics = comics.filter(c => !fs.existsSync(path.join(COVER_DIR, `c${c.id}.jpg`)));
    if (!missingBooks.length && !missingComics.length) return;

    let restored = 0;
    for (const book of missingBooks) {
        try {
            const filePath = book.filePath && fs.existsSync(book.filePath) ? book.filePath : null;
            if (filePath && path.extname(filePath).toLowerCase() === '.pdf') {
                const page = await pdfFirstPageAsJpeg(filePath).catch(() => null);
                if (page) {
                    cacheCoverBuffer(path.join(COVER_DIR, `${book.id}.jpg`), page);
                    restored++;
                    continue;
                }
            }
            if (await fetchAndCacheCover(book.id, book.isbn, book.title, filePath)) restored++;
        } catch {}
    }
    for (const comic of missingComics) {
        try {
            if (!comic.filePath || !fs.existsSync(comic.filePath)) continue;
            const cover = await extractCover(comic.filePath);
            if (cover) {
                cacheCoverBuffer(path.join(COVER_DIR, `c${comic.id}.jpg`), cover);
                restored++;
            }
        } catch {}
    }
    console.log(`[covers] backfilled ${restored}/${missingBooks.length + missingComics.length} missing cover(s)`);
}
