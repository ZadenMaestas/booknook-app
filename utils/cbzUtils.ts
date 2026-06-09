import path from 'path';
import type { ComicMetadata, PageData } from '../types/index';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);
const MIME: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif',  '.webp': 'image/webp',  '.avif': 'image/avif',
};

const isImage = (name: string) => IMAGE_EXTS.has(path.extname(name).toLowerCase());
const naturalSort = (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

// ── 7z handles both ZIP/CBZ and RAR/CBR without loading the whole file ────────

async function spawn7z(args: string[]): Promise<Buffer> {
    const proc = Bun.spawn(['7z', ...args], { stdout: 'pipe', stderr: 'ignore' });
    const buf = await new Response(proc.stdout).arrayBuffer();
    await proc.exited;
    return Buffer.from(buf);
}

async function listEntries(filePath: string): Promise<string[]> {
    const out = (await spawn7z(['l', '-slt', filePath])).toString('utf-8');
    return out.split('\n')
        .filter(line => line.startsWith('Path = '))
        .map(line => line.slice(7).trim());
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getPages(filePath: string): Promise<string[]> {
    return (await listEntries(filePath)).filter(isImage).sort(naturalSort);
}

export async function getPage(filePath: string, entryName: string): Promise<PageData | null> {
    try {
        const data = await spawn7z(['e', '-so', filePath, entryName]);
        if (!data.length) return null;
        return { data, mime: MIME[path.extname(entryName).toLowerCase()] || 'image/jpeg' };
    } catch { return null; }
}

export async function extractCover(filePath: string): Promise<Buffer | null> {
    const pages = await getPages(filePath);
    return pages.length ? (await getPage(filePath, pages[0]))?.data ?? null : null;
}

export function parseComicFilename(raw: string): { series: string | null; year: number | null; issue: string | null } {
    const withYear = raw.match(/^(.+?)\s+\((\d{4})\)\s+#?0*(\d+)/);
    if (withYear) return {
        series: withYear[1].trim(),
        year:   parseInt(withYear[2], 10),
        issue:  parseInt(withYear[3], 10).toString(),
    };
    const issueBeforeYear = raw.match(/^(.+?)\s+0*(\d+)\s+\((\d{4})\)$/);
    if (issueBeforeYear) return {
        series: issueBeforeYear[1].trim(),
        year:   parseInt(issueBeforeYear[3], 10),
        issue:  parseInt(issueBeforeYear[2], 10).toString(),
    };
    const noYear = raw.match(/^(.+?)\s+#?0*(\d+)$/);
    if (noYear) return {
        series: noYear[1].trim(),
        year:   null,
        issue:  parseInt(noYear[2], 10).toString(),
    };
    return { series: null, year: null, issue: null };
}

export async function parseComicInfo(filePath: string): Promise<ComicMetadata | null> {
    try {
        const xml = (await spawn7z(['e', '-so', filePath, 'ComicInfo.xml'])).toString('utf-8');
        if (!xml.trim()) return null;
        const get = (tag: string) => xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim() ?? null;
        return { title: get('Title'), series: get('Series'), issue: get('Number'), writer: get('Writer') };
    } catch { return null; }
}
