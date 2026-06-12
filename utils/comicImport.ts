import path from 'path';
import { getPages, extractCover, parseComicInfo, parseComicFilename } from './cbzUtils';
import { cacheCoverBuffer } from './coverUtils';
import { COVER_DIR } from './paths';

export interface ComicMeta {
    title:     string;
    series:    string | null;
    issue:     string | null;
    year:      number | null;
    pageCount: number;
}

export async function resolveComicMeta(filePath: string): Promise<ComicMeta> {
    const ext    = path.extname(filePath).toLowerCase();
    const raw    = path.basename(filePath, ext);
    const info   = await parseComicInfo(filePath);
    const pages  = await getPages(filePath);
    const parsed = parseComicFilename(raw);
    return {
        title:     info?.title  || (parsed.series ? `${parsed.series} #${parsed.issue}` : raw.replace(/[-_]/g, ' ')),
        series:    info?.series || parsed.series,
        issue:     info?.issue  || parsed.issue,
        year:      parsed.year,
        pageCount: pages.length,
    };
}

export async function saveComicCover(id: number, filePath: string): Promise<void> {
    // A failed cover (no extractable image, unwritable cache dir) must never fail the import
    try {
        const cover = await extractCover(filePath);
        if (cover) cacheCoverBuffer(path.join(COVER_DIR, `c${id}.jpg`), cover);
        else console.warn(`[covers] no cover found in ${path.basename(filePath)}`);
    } catch (err) {
        console.error(`[covers] comic ${id}:`, (err as Error).message);
    }
}
