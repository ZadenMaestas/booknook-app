import fs from 'fs';
import path from 'path';
import { getPages, extractCover, parseComicInfo, parseComicFilename } from './cbzUtils';
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
    fs.mkdirSync(COVER_DIR, { recursive: true });
    const cover = await extractCover(filePath);
    if (cover) fs.writeFileSync(path.join(COVER_DIR, `c${id}.jpg`), cover);
}
