// user-card example
class UserCard extends HTMLElement {
    constructor() {
        super();
        // Attach Shadow DOM for scoped styles and DOM encapsulation
        this.attachShadow({ mode: 'open' });
    }

    // Specify attributes to observe for changes
    static get observedAttributes() {
        return ['name', 'avatar'];
    }

    // Lifecycle: Runs when the element is added to the DOM
    connectedCallback() {
        this.render();
    }

    // Lifecycle: Runs when an observed attribute changes
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            this.render();
        }
    }

    render() {
        const name = this.getAttribute('name') || 'Guest';
        const avatar = this.getAttribute('avatar') || 'default.png';

        this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          border: 1px solid #ccc;
          border-radius: 8px;
        }
        img { width: 50px; height: 50px; border-radius: 50%; }
        h3 { margin: 0; }
      </style>
      <img src="${avatar}" alt="${name}">
      <div>
        <h3>${name}</h3>
        <slot></slot> 
      </div>
    `;
    }
}

// Register the component
customElements.define('user-card', UserCard);
