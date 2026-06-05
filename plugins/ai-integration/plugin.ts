import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { PluginContext } from '../index';
import type { Book } from '../../types';

interface Recommendation {
    title: string;
    author: string;
    reason: string;
}

interface StoredRec {
    id: number;
    book_id: number;
    note: string;
    created_at: string;
    bookTitle?: string;
    bookAuthor?: string;
}

const icon = `<svg fill="currentColor" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
<path d="M12 2a1 1 0 0 1 1 1v1.07A8.001 8.001 0 0 1 20 12h1a1 1 0 1 1 0 2h-1a8.001 8.001 0 0 1-7 6.93V22a1 1 0 1 1-2 0v-1.07A8.001 8.001 0 0 1 4 14H3a1 1 0 1 1 0-2h1a8.001 8.001 0 0 1 7-6.93V3a1 1 0 0 1 1-1zm0 4a6 6 0 1 0 0 12A6 6 0 0 0 12 6zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>
</svg>`;

export default {
    name: 'AI Integration',
    version: '1.0.0',

    register({ db, router, pluginDir, render, addNavItem, addStylesheet, addScript, on }: PluginContext) {
        db.prepare(`CREATE TABLE IF NOT EXISTS ai_integration (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id    INTEGER NOT NULL,
            note       TEXT    NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )`).run();

        addNavItem({ label: 'AI', href: '/plugins/ai-integration', icon });
        addStylesheet('/plugins/ai-integration/styles.css');
        addScript('/plugins/ai-integration/client.js');

        router.get('/', c => {
            const recs = db.prepare(`
                SELECT r.*, b.title as bookTitle, b.author as bookAuthor
                FROM ai_integration r
                LEFT JOIN books b ON b.id = r.book_id
                ORDER BY r.created_at DESC
                LIMIT 50
            `).all() as StoredRec[];
            const apiConfigured = !!process.env.GEMINI_API_KEY;
            return render(c, path.join(pluginDir, 'views/index.pug'), { recs, apiConfigured });
        });

        router.get('/api/book/:id', c => {
            const bookId = c.req.param('id');
            const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as Book | null;
            if (!book) return c.json({ error: 'Not found' }, 404);
            return c.json(book);
        });

        router.post('/api/recommendations/:id', async c => {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) return c.json({ error: 'GEMINI_API_KEY not set in .env' }, 503);

            const bookId = c.req.param('id');
            const book = db.prepare('SELECT * FROM books WHERE id = ?').get(bookId) as Book | null;
            if (!book) return c.json({ error: 'Book not found' }, 404);

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-lite' });

            const bookDesc = [
                `"${book.title}"`,
                book.author && `by ${book.author}`,
                book.isbn   && `(ISBN: ${book.isbn})`,
            ].filter(Boolean).join(' ');

            const prompt = `I just finished reading ${bookDesc}. Recommend 5 books I'd enjoy next.
Reply ONLY with a valid JSON array, no markdown, no explanation:
[{"title":"...","author":"...","reason":"one sentence why I'd enjoy it"}]`;

            let text: string;
            try {
                const result = await model.generateContent(prompt);
                text = result.response.text().trim();
            } catch (e) {
                const msg = (e as Error).message ?? '';
                if (msg.includes('429')) {
                    const retryMatch = msg.match(/retry[^:]*:\s*"?(\d+)/i);
                    const seconds = retryMatch ? parseInt(retryMatch[1], 10) : null;
                    const detail = seconds
                        ? `Gemini rate limit hit — free tier quota exhausted. Try again in ${seconds}s.`
                        : 'Gemini rate limit hit — free tier quota exhausted. Try again in a moment.';
                    return c.json({ error: detail, retryAfter: seconds }, 429);
                }
                return c.json({ error: `Gemini error: ${msg.split('\n')[0]}` }, 502);
            }

            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) return c.json({ error: 'Failed to parse AI response' }, 500);

            const recommendations: Recommendation[] = JSON.parse(jsonMatch[0]);

            db.prepare('DELETE FROM ai_integration WHERE book_id = ?').run(bookId);
            db.prepare('INSERT INTO ai_integration (book_id, note) VALUES (?, ?)').run(
                bookId, JSON.stringify(recommendations)
            );

            return c.json({
                book: { title: book.title, author: book.author },
                recommendations,
            });
        });

        on('bookDeleted', ({ id }: { id: number }) => {
            db.prepare('DELETE FROM ai_integration WHERE book_id = ?').run(id);
        });
    },
};
