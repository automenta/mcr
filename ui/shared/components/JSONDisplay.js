export class JSONDisplay extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="../variables.css">
      <style>
        :host {
          display: block;
          padding: 10px;
          border: 1px solid var(--border-color);
          border-radius: var(--border-radius);
          color: var(--text-color);
          font-family: var(--font-family);
        }
        h3 {
          margin-top: 0;
        }
        pre {
            font-family: var(--font-family-mono);
        }
      </style>
      <h3 id="title"></h3>
      <div id="content"></div>
    `;
	}

	connectedCallback() {
		const title = this.getAttribute('title') || 'JSON Display';
		this.shadowRoot.getElementById('title').textContent = title;
	}

	update(data) {
		const content = this.shadowRoot.getElementById('content');
		content.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
	}
}

customElements.define('json-display', JSONDisplay);
