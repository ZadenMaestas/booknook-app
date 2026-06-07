export type ReadingStatus = 'none' | 'want' | 'reading' | 'read';

export interface SessionUser {
    id: number;
    username: string;
    isAdmin: boolean;
}

export interface Session {
    user?: SessionUser;
    save(maxAge?: number): Promise<void>;
    destroy(): Promise<void>;
}

export type AppVariables = {
    session: Session;
};

export interface DbUser {
    id: number;
    username: string;
    password_hash: string;
    is_admin: 0 | 1;
    created_at: string;
}

export interface Book {
    id: number;
    title: string;
    author: string | null;
    isbn: string | null;
    filePath: string;
    status: ReadingStatus;
    created_at: string;
}

export interface Comic {
    id: number;
    title: string;
    series: string | null;
    issue: string | null;
    year: number | null;
    filePath: string;
    pageCount: number;
    status: ReadingStatus;
    created_at: string;
}

export interface ReadingProgress {
    user_id: number;
    book_id: number;
    cfi: string;
    percentage: number;
    updated_at: string;
}

export interface ComicProgress {
    user_id: number;
    comic_id: number;
    page: number;
}

export interface BookMetadata {
    title: string | null;
    author: string | null;
    publisher: string | null;
    isbn: string | null;
}

export interface ComicMetadata {
    title: string | null;
    series: string | null;
    issue: string | null;
    writer: string | null;
}

export interface OpenLibraryResult {
    title: string;
    author: string | null;
    isbn: string | null;
    coverId: number | null;
}

export interface NavItem {
    label: string;
    href: string;
    icon?: string;
    _plugin?: string;
}

export interface ApiKey {
    id: number;
    name: string;
    key: string;
    created_at: string;
}

export interface PageData {
    data: Buffer;
    mime: string;
}

export interface SpineResult {
    opfDir: string;
    spine: string[];
}
