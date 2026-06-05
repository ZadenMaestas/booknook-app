import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export function pdfFirstPageAsJpeg(pdfPath: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const tmp = path.join(os.tmpdir(), `bn-cover-${process.hrtime.bigint()}`);
        const proc = spawn('pdftoppm', ['-jpeg', '-f', '1', '-l', '1', '-r', '150', '-singlefile', pdfPath, tmp]);
        proc.on('close', code => {
            if (code !== 0) return reject(new Error(`pdftoppm exited ${code}`));
            const out = tmp + '.jpg';
            if (!fs.existsSync(out)) return reject(new Error('pdftoppm produced no output'));
            const buf = fs.readFileSync(out);
            fs.unlinkSync(out);
            resolve(buf);
        });
        proc.on('error', reject);
    });
}

function pdfToEpub(pdfPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const epubPath = pdfPath.replace(/\.pdf$/i, '.epub');
        const proc = spawn('ebook-convert', [pdfPath, epubPath]);
        proc.on('close', code => {
            if (code !== 0) return reject(new Error(`ebook-convert exited ${code}`));
            try { fs.unlinkSync(pdfPath); } catch {}
            resolve(epubPath);
        });
        proc.on('error', reject);
    });
}

export async function normaliseToEpub(filePath: string): Promise<string> {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') return await pdfToEpub(filePath);
    return filePath;
}
