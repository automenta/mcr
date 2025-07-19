export class PanelComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
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
            </style>
            <div class="panel">
                <slot></slot>
            </div>
        `;
	}
}

customElements.define('panel-component', PanelComponent);
