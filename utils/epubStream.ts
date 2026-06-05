import AdmZip from 'adm-zip';
import path from 'path';
import type { SpineResult } from '../types/index';

export const MIME: Record<string, string> = {
    '.html':  'text/html; charset=utf-8',
    '.xhtml': 'application/xhtml+xml; charset=utf-8',
    '.css':   'text/css',
    '.js':    'application/javascript',
    '.jpg':   'image/jpeg',
    '.jpeg':  'image/jpeg',
    '.png':   'image/png',
    '.gif':   'image/gif',
    '.svg':   'image/svg+xml',
    '.webp':  'image/webp',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
    '.ttf':   'font/ttf',
    '.otf':   'font/otf',
    '.xml':   'application/xml',
    '.opf':   'application/oebps-package+xml',
    '.ncx':   'application/x-dtbncx+xml',
};

export function openZip(filePath: string): AdmZip {
    return new AdmZip(filePath);
}

export function getEntry(zip: AdmZip, resourcePath: string): AdmZip.IZipEntry | null {
    return zip.getEntry(resourcePath)
        || zip.getEntry(resourcePath.replace(/\\/g, '/'))
        || null;
}

export function parseSpine(zip: AdmZip): SpineResult {
    const containerEntry = getEntry(zip, 'META-INF/container.xml');
    if (!containerEntry) throw new Error('container.xml missing');

    const containerXml = containerEntry.getData().toString('utf-8');
    const rootfileMatch = containerXml.match(/full-path="([^"]+)"/);
    if (!rootfileMatch) throw new Error('No rootfile in container.xml');

    const opfPath = rootfileMatch[1];
    const opfDir  = path.dirname(opfPath).replace(/^\.\//, '');
    const opfEntry = getEntry(zip, opfPath);
    if (!opfEntry) throw new Error(`OPF not found: ${opfPath}`);

    const opf = opfEntry.getData().toString('utf-8');

    const manifest: Record<string, string> = {};
    const itemRe = /<item\b[^>]+>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(opf))) {
        const idM   = m[0].match(/\bid="([^"]+)"/);
        const hrefM = m[0].match(/\bhref="([^"]+)"/);
        if (idM && hrefM) manifest[idM[1]] = hrefM[1];
    }

    const spine: string[] = [];
    const itemrefRe = /<itemref\b[^>]+idref="([^"]+)"/g;
    while ((m = itemrefRe.exec(opf))) {
        const href = manifest[m[1]];
        if (!href) continue;
        const full = opfDir ? `${opfDir}/${href}` : href;
        spine.push(full.replace(/\/\.\//g, '/'));
    }

    return { opfDir, spine };
}
