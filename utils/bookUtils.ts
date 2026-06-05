import { EPub } from 'epub2';
import path from 'path';
import type { BookMetadata, OpenLibraryResult } from '../types/index';

function parseEpub2(filePath: string): Promise<EPub> {
    return new Promise((resolve, reject) => {
        const epub = new EPub(filePath);
        epub.on('end', () => resolve(epub));
        epub.on('error', reject);
        epub.parse();
    });
}

export async function getEpubData(filePath: string): Promise<BookMetadata> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.epub') {
        const name = path.basename(filePath, ext).replace(/[-_]/g, ' ');
        return { title: name, author: null, publisher: null, isbn: null };
    }
    try {
        const epub = await parseEpub2(filePath);
        return {
            title: epub.metadata.title || null,
            author: epub.metadata.creator || null,
            publisher: epub.metadata.publisher || null,
            isbn: epub.metadata.ISBN || null,
        };
    } catch {
        const name = path.basename(filePath, '.epub').replace(/[-_]/g, ' ');
        return { title: name, author: null, publisher: null, isbn: null };
    }
}

function splitCamelCase(str: string): string {
    return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
}

export async function lookupByTitle(rawTitle: string): Promise<OpenLibraryResult | null> {
    const title = splitCamelCase(rawTitle).replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
    const params = new URLSearchParams({ title, limit: '1', fields: 'title,author_name,isbn,cover_i' });
    try {
        const res = await fetch(`https://openlibrary.org/search.json?${params}`);
        const data = await res.json() as {
            docs?: Array<{
                title?: string;
                author_name?: string[];
                isbn?: string[];
                cover_i?: number;
            }>;
        };
        const doc = data.docs?.[0];
        if (!doc) return null;
        const isbns = doc.isbn ?? [];
        return {
            title: doc.title ?? title,
            author: doc.author_name?.[0] ?? null,
            isbn: isbns.find(i => i.length === 13) ?? isbns.find(i => i.length === 10) ?? null,
            coverId: doc.cover_i ?? null,
        };
    } catch { return null; }
}

async function lookupISBNByTitle(title: string, _author: string | null): Promise<string | null> {
    if (!title) return null;
    const result = await lookupByTitle(title);
    return result?.isbn ?? null;
}

export async function resolveISBN(filePath: string, title: string | null, author: string | null): Promise<string | null> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.epub') {
        try {
            const epub = await parseEpub2(filePath);
            if (epub.metadata.ISBN) return epub.metadata.ISBN;
        } catch {}
    }
    return await lookupISBNByTitle(title ?? '', author);
}
