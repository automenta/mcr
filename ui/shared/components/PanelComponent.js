export class PanelComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}

	connectedCallback() {
		this.render();
	}

	render() {
		this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="../variables.css">
            <style>
                .panel {
                    background-color: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    padding: 1.5rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                    color: var(--text-color);
                    font-family: var(--font-family);
                }
                h2 {
                    margin-top: 0;
                    color: var(--text-color);
                    font-family: var(--font-family);
                }
            </style>
            <div class="panel">
                <h2 id="title">${this.title}</h2>
                <slot></slot>
            </div>
        `;
	}

	set title(value) {
		this.setAttribute('title', value);
		this.render();
	}

	get title() {
		return this.getAttribute('title') || '';
	}
}

customElements.define('panel-component', PanelComponent);
