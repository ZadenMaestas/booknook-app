(function () {
    document.addEventListener('DOMContentLoaded', function () {
        const match = location.pathname.match(/^\/comics\/read\/(\d+)$/);
        if (!match) return;
        const topbar = document.querySelector('.comic-topbar');
        if (!topbar) return;

        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('fill', 'none'); svg.setAttribute('width', '18'); svg.setAttribute('height', '18');
        svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
        for (const [x, y, w, h] of [[2,3,9,8],[13,3,9,8],[2,13,9,8],[13,13,9,8]]) {
            const r = document.createElementNS(NS, 'rect');
            r.setAttribute('x', x); r.setAttribute('y', y); r.setAttribute('width', w); r.setAttribute('height', h); r.setAttribute('rx', '1');
            svg.appendChild(r);
        }

        const a = document.createElement('a');
        a.href = '/plugins/panel-reader/read/' + match[1];
        a.className = 'comic-icon-btn';
        a.title = 'Panel Mode';
        a.style.cssText = 'text-decoration:none;display:flex;align-items:center;';
        a.appendChild(svg);

        const fsBtn = document.getElementById('fs-btn');
        if (fsBtn) topbar.insertBefore(a, fsBtn);
        else topbar.appendChild(a);
    });
})();
