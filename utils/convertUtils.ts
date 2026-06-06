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

