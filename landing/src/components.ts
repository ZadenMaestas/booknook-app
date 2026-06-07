class UserCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes(): string[] {
        return ['name', 'avatar'];
    }

    connectedCallback(): void {
        this.render();
    }

    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void {
        if (oldValue !== newValue) this.render();
    }

    private render(): void {
        const name = this.getAttribute('name') ?? 'Guest';
        const avatar = this.getAttribute('avatar') ?? 'default.png';
        this.shadowRoot!.innerHTML = `
            <style>
                :host { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid #ccc; border-radius: 8px; }
                img { width: 50px; height: 50px; border-radius: 50%; }
                h3 { margin: 0; }
            </style>
            <img src="${avatar}" alt="${name}">
            <div><h3>${name}</h3><slot></slot></div>
        `;
    }
}

customElements.define('user-card', UserCard);
