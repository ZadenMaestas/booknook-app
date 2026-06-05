declare module 'livereload' {
    export interface Server {
        watch(paths: string | string[]): void;
        close(): void;
    }

    export function createServer(opts?: Record<string, unknown>): Server;
}
