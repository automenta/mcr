import '/home/me/mcr/ui/shared/main.js';

class MCRWorkbench extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}

	connectedCallback() {
		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: contents;
                }
            </style>
            <main-layout></main-layout>
        `;
	}
}

customElements.define('mcr-workbench', MCRWorkbench);

document.addEventListener('DOMContentLoaded', () => {
	const app = document.getElementById('app');
	app.innerHTML = '<mcr-workbench></mcr-workbench>';
});
