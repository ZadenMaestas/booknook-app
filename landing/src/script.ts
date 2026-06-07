function openMenu(): void {
    document.body.classList.add('menu-open');
}

function closeMenu(): void {
    document.body.classList.remove('menu-open');
}

function updateThemeAssets(theme: string): void {
    const heroImg = document.querySelector<HTMLImageElement>('.header__image img');
    const logo = document.querySelector<HTMLImageElement>('.logo');
    if (heroImg) {
        heroImg.src = theme === 'dark' ? '/assets/hero-illustration-dark.svg' : '/assets/hero-illustration-warm.svg';
    }
    if (logo) {
        logo.src = theme === 'dark' ? '/assets/logo-dark.svg' : '/assets/logo.svg';
    }
}

function toggleTheme(): void {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    updateThemeAssets(next);
}

declare const lucide: { createIcons: () => void };

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();

    const theme = localStorage.getItem('theme') ?? 'light';
    updateThemeAssets(theme);

    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.querySelector('.btn__menu')?.addEventListener('click', openMenu);
    document.querySelector('.menu__close')?.addEventListener('click', closeMenu);
    document.querySelectorAll<HTMLAnchorElement>('.menu__link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });
});
