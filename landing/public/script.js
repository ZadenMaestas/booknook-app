/* Nav Code */

function openMenu() {
    document.body.classList.add("menu-open");
}
function closeMenu() {
    document.body.classList.remove("menu-open");
}

function toggleTheme() {
    let next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
    if (next === 'dark') {
        document.querySelector('.header__image').children[0].src = "/assets/hero-illustration-dark.svg";
        document.querySelector('.logo').src = "/assets/logo-dark.svg";
    } else {
        document.querySelector('.header__image').children[0].src = "/assets/hero-illustration-warm.svg";
        document.querySelector('.logo').src = "/assets/logo.svg";
    }
}

document.addEventListener('DOMContentLoaded', (event) => {
    if (localStorage.getItem('theme') === 'dark') {
        document.querySelector('.header__image').children[0].src = "/assets/hero-illustration-dark.svg";
        document.querySelector('.logo').src = "/assets/logo-dark.svg";
    }
});
