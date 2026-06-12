import path from 'path';
import { getEpubData, lookupByTitle, resolveISBN } from './bookUtils';
import { pdfFirstPageAsJpeg } from './convertUtils';
import { cacheCoverBuffer, fetchAndCacheCover } from './coverUtils';
import { COVER_DIR } from './paths';

export const BOOK_EXTS = new Set(['.pdf', '.epub', '.mobi', '.azw', '.azw3', '.djvu', '.fb2']);

export interface BookMeta {
    title:    string | null;
    author:   string | null;
    isbn:     string | null;
    coverId:  number | null;
    pdfCover: Buffer | null;
}

export async function resolveBookMeta(filePath: string): Promise<BookMeta> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
        const pdfCover = await pdfFirstPageAsJpeg(filePath).catch(() => null);
        const rawName  = path.basename(filePath, '.pdf');
        const lookup   = await lookupByTitle(rawName);
        return {
            title:    lookup?.title   ?? rawName.replace(/[-_]/g, ' '),
            author:   lookup?.author  ?? null,
            isbn:     lookup?.isbn    ?? null,
            coverId:  lookup?.coverId ?? null,
            pdfCover,
        };
    }
    const data = await getEpubData(filePath);
    return {
        title:    data.title,
        author:   data.author,
        isbn:     data.isbn ?? await resolveISBN(filePath, data.title, data.author),
        coverId:  null,
        pdfCover: null,
    };
}

export async function saveBookCover(id: number, meta: Pick<BookMeta, 'isbn' | 'title' | 'coverId' | 'pdfCover'>, filePath: string): Promise<void> {
    // A failed cover (unwritable cache dir, network down) must never fail the import
    try {
        if (meta.pdfCover) {
            cacheCoverBuffer(path.join(COVER_DIR, `${id}.jpg`), meta.pdfCover);
        } else {
            fetchAndCacheCover(id, meta.isbn, meta.title, filePath, meta.coverId)
                .catch(err => console.error(`[covers] book ${id}:`, err));
        }
    } catch (err) {
        console.error(`[covers] book ${id}:`, (err as Error).message);
    }
}
