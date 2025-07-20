export class SystemState extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                }
                pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    background-color: #f9fafb;
                    padding: 1rem;
                    border-radius: 6px;
                }
                .controls {
                    margin-bottom: 1rem;
                }
                button {
                    padding: 0.5rem 1rem;
                    border: 1px solid #d1d5db;
                    background-color: #fff;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                button:hover {
                    background-color: #f3f4f6;
                }
            </style>
            <panel-component title="Knowledge Base">
                <div>
                    <div class="controls">
                        <button id="toggle-raw">Show Raw</button>
                    </div>
                    <pre><code class="language-prolog"></code></pre>
                </div>
            </panel-component>
        `;
		this.codeElement = this.shadowRoot.querySelector('code');
		this.toggleButton = this.shadowRoot.querySelector('#toggle-raw');

		this.isRawVisible = false;
		this.knowledgeBase = {};

		this.toggleButton.addEventListener('click', this.toggleRaw.bind(this));
	}

	connectedCallback() {
		document.addEventListener(
			'knowledge-base-updated',
			this.updateKnowledgeBase.bind(this)
		);
	}

	updateKnowledgeBase(event) {
		this.knowledgeBase = event.detail.knowledgeBase;
		this.render();
	}

	toggleRaw() {
		this.isRawVisible = !this.isRawVisible;
		this.toggleButton.textContent = this.isRawVisible
			? 'Show Parsed'
			: 'Show Raw';
		this.render();
	}

	render() {
        const codeElement = this.shadowRoot.querySelector('code');
        if (!codeElement) return;

        let content = '';
        if (this.isRawVisible) {
            content = this.knowledgeBase;
        } else {
            // This is a simplified display. A proper Prolog parser would be better.
            content = (this.knowledgeBase || '')
                .replace(/([a-z_]+)\(/g, '\n  $1(')
                .trim();
        }
        codeElement.textContent = content;
        if (typeof hljs !== 'undefined') {
            hljs.highlightElement(codeElement);
        }
    }
}

customElements.define('system-state', SystemState);
