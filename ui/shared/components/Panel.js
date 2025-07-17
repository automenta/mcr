class PanelComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                .panel {
                    background-color: #fff;
                    border: 1px solid #e0e6ed;
                    border-radius: 8px;
                    padding: 1.5rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                }
            </style>
            <div class="panel">
                <slot></slot>
            </div>
        `;
	}
}

customElements.define('panel-component', PanelComponent);
