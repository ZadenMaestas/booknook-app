(function () {
    // ── Detect Anna's Archive availability via sidebar nav ─────────────────────
    const annasAvailable = !!document.querySelector('a[href="/plugins/annas-archive"]');

    // ── Wire up server-rendered rec cards (AI history page) ───────────────────
    // Runs on every page; only the AI page has these elements.
    document.querySelectorAll('.ai-rec__dl-btn[data-title]').forEach(btn => {
        if (!annasAvailable) { btn.closest('.ai-rec__dl-row').style.display = 'none'; return; }
        btn.addEventListener('click', () =>
            handleDownload({ title: btn.dataset.title, author: btn.dataset.author || '' }, btn)
        );
    });

    const menu = document.getElementById('context-menu');
    if (!menu) return;

    // ── Append to context menu ─────────────────────────────────────────────────
    const sep = document.createElement('div');
    sep.className = 'context-menu__sep';
    menu.appendChild(sep);

    const ctxBtn = document.createElement('button');
    ctxBtn.className = 'context-menu__item';
    ctxBtn.id = 'ctx-ai-recommendations';
    ctxBtn.textContent = '✦ AI Recommendations';
    menu.appendChild(ctxBtn);

    // ── Build modal ────────────────────────────────────────────────────────────
    const modal = document.createElement('div');
    modal.id = 'ai-modal';
    modal.className = 'ai-modal';
    modal.innerHTML = `
        <div class="ai-modal__backdrop"></div>
        <div class="ai-modal__panel">
            <div class="ai-modal__header">
                <span class="ai-modal__title">AI Recommendations</span>
                <button class="ai-modal__close" aria-label="Close">✕</button>
            </div>
            <div class="ai-modal__body">
                <div class="ai-modal__loading">
                    <div class="ai-modal__spinner"></div>
                    <p>Asking Gemini…</p>
                </div>
                <div class="ai-modal__content"></div>
                <div class="ai-modal__error"></div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const backdrop  = modal.querySelector('.ai-modal__backdrop');
    const closeBtn  = modal.querySelector('.ai-modal__close');
    const loadingEl = modal.querySelector('.ai-modal__loading');
    const contentEl = modal.querySelector('.ai-modal__content');
    const errorEl   = modal.querySelector('.ai-modal__error');

    // Use style.display so CSS display:flex on .ai-modal__loading can't interfere
    function show(el)  { el.style.display = ''; }
    function hide(el)  { el.style.display = 'none'; }

    function setState(state) {
        hide(loadingEl); hide(contentEl); hide(errorEl);
        if (state === 'loading') show(loadingEl);
        else if (state === 'content') show(contentEl);
        else if (state === 'error') show(errorEl);
    }

    // Start hidden
    setState('loading');
    hide(modal.querySelector('.ai-modal__body')); // body hidden until modal opens

    const openModal  = () => {
        modal.classList.add('ai-modal--visible');
        show(modal.querySelector('.ai-modal__body'));
    };
    const closeModal = () => modal.classList.remove('ai-modal--visible');

    backdrop.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

    // ── Error with optional retry countdown ───────────────────────────────────
    let _countdownTimer = null;
    function showErrorMsg(msg, retryAfter) {
        clearInterval(_countdownTimer);
        errorEl.textContent = '';

        const text = document.createElement('p');
        text.className = 'ai-modal__error-msg';
        text.textContent = msg;
        errorEl.append(text);

        if (retryAfter && retryAfter > 0) {
            const countdown = document.createElement('p');
            countdown.className = 'ai-modal__error-countdown';
            let remaining = retryAfter;
            const update = () => { countdown.textContent = `Retry available in ${remaining}s`; };
            update();
            errorEl.append(countdown);
            _countdownTimer = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(_countdownTimer);
                    countdown.textContent = 'You can try again now.';
                } else {
                    update();
                }
            }, 1000);
        }

        setState('error');
    }

    // ── Render recommendations ─────────────────────────────────────────────────
    function showRecs(book, recs) {
        contentEl.textContent = '';

        const intro = document.createElement('p');
        intro.className = 'ai-modal__for';
        intro.append('Based on ');
        const em = document.createElement('em');
        em.textContent = book.title;
        intro.append(em);
        if (book.author) intro.append(` by ${book.author}`);
        contentEl.append(intro);

        const list = document.createElement('ol');
        list.className = 'ai-rec-list';

        for (const r of recs) {
            const li = document.createElement('li');
            li.className = 'ai-rec';

            const titleEl = document.createElement('div');
            titleEl.className = 'ai-rec__title';
            titleEl.textContent = r.title;

            const authorEl = document.createElement('div');
            authorEl.className = 'ai-rec__author';
            authorEl.textContent = r.author;

            const reasonEl = document.createElement('div');
            reasonEl.className = 'ai-rec__reason';
            reasonEl.textContent = r.reason;

            li.append(titleEl, authorEl, reasonEl);

            if (annasAvailable) {
                const dlRow = document.createElement('div');
                dlRow.className = 'ai-rec__dl-row';
                const dlBtn = document.createElement('button');
                dlBtn.className = 'ai-rec__dl-btn';
                dlBtn.textContent = '↓ Add to Library';
                dlRow.append(dlBtn);
                li.append(dlRow);

                dlBtn.addEventListener('click', () => handleDownload(r, dlBtn));
            }

            list.append(li);
        }

        contentEl.append(list);
        setState('content');
    }

    // ── Anna's Archive download flow ───────────────────────────────────────────
    async function handleDownload(rec, btn) {
        btn.disabled = true;
        btn.textContent = 'Searching…';

        const q = encodeURIComponent(`${rec.title} ${rec.author}`);
        let results;
        try {
            const res = await fetch(`/plugins/annas-archive/api/search?q=${q}`);
            if (!res.ok) { setBtnState(btn, 'error', 'Anna\'s Archive unavailable'); return; }
            results = await res.json();
        } catch {
            setBtnState(btn, 'error', 'Network error');
            return;
        }

        if (!results?.length) {
            setBtnState(btn, 'error', 'Not found on Anna\'s Archive');
            return;
        }

        const match = results[0];
        btn.textContent = `Download ${match.format.toUpperCase()} (${match.size || '?'})`;
        btn.disabled = false;
        btn.dataset.phase = 'confirm';

        btn.addEventListener('click', async function onConfirm() {
            btn.removeEventListener('click', onConfirm);
            btn.disabled = true;
            btn.textContent = 'Downloading…';

            try {
                const res = await fetch('/plugins/annas-archive/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ md5: match.md5, title: match.title, format: match.format, author: match.author }),
                });
                if (res.status === 409) { setBtnState(btn, 'done', 'Already in library'); return; }
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                    setBtnState(btn, 'error', err.error || 'Download failed');
                    return;
                }
                setBtnState(btn, 'done', 'Added to library ✓');
            } catch {
                setBtnState(btn, 'error', 'Network error');
            }
        }, { once: true });
    }

    function setBtnState(btn, type, text) {
        btn.disabled = type !== 'error';
        btn.textContent = text;
        btn.className = `ai-rec__dl-btn ai-rec__dl-btn--${type}`;
        if (type === 'error') {
            btn.disabled = false;
            btn.addEventListener('click', () => {
                btn.className = 'ai-rec__dl-btn';
                btn.textContent = '↓ Add to Library';
                btn.disabled = false;
                btn.dataset.phase = '';
            }, { once: true });
        }
    }

    // ── Context-menu click ─────────────────────────────────────────────────────
    ctxBtn.addEventListener('click', async () => {
        const activeId = window._bookNookActiveId;
        if (!activeId) return;

        setState('loading');
        openModal();

        try {
            const res = await fetch(`/plugins/ai-integration/api/recommendations/${activeId}`, {
                method: 'POST',
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                showErrorMsg(err.error || 'Something went wrong', err.retryAfter ?? null);
                return;
            }
            const data = await res.json();
            showRecs(data.book, data.recommendations);
        } catch {
            showErrorMsg('Network error — check the server logs', null);
        }
    });
})();
