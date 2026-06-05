import fs from 'fs';
import path from 'path';
import { stream } from 'hono/streaming';
import type { Hono } from 'hono';
import type { AppVariables } from '../types/index';

export default function devMiddleware(app: Hono<{ Variables: AppVariables }>): void {
    const writers: Array<(msg: string) => void> = [];

    app.get('/__livereload', c => {
        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('Connection', 'keep-alive');

        return stream(c, async s => {
            const write = (msg: string) => { s.write(msg); };
            writers.push(write);
            await new Promise<void>(resolve => {
                s.onAbort(() => {
                    writers.splice(writers.indexOf(write), 1);
                    resolve();
                });
            });
        });
    });

    fs.watch(path.join(__dirname, '../views'), { recursive: true }, () => {
        for (const w of writers) w('data: reload\n\n');
    });
}
