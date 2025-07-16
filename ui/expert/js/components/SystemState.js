class SystemState extends HTMLElement {
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
                    background-color: #f4f4f4;
                    padding: 1rem;
                    border: 1px solid #ccc;
                }
                .controls {
                    margin-bottom: 1rem;
                }
            </style>
            <div>
                <h2>Knowledge Base</h2>
                <div class="controls">
                    <button id="toggle-raw">Show Raw</button>
                </div>
                <pre><code class="language-json"></code></pre>
            </div>
        `;
        this.codeElement = this.shadowRoot.querySelector('code');
        this.toggleButton = this.shadowRoot.querySelector('#toggle-raw');

        this.isRawVisible = false;
        this.knowledgeBase = {};

        this.toggleButton.addEventListener('click', this.toggleRaw.bind(this));
    }

    connectedCallback() {
        document.addEventListener('knowledge-base-updated', this.updateKnowledgeBase.bind(this));
    }

    updateKnowledgeBase(event) {
        this.knowledgeBase = event.detail.knowledgeBase;
        this.render();
    }

    toggleRaw() {
        this.isRawVisible = !this.isRawVisible;
        this.toggleButton.textContent = this.isRawVisible ? 'Show Parsed' : 'Show Raw';
        this.render();
    }

    render() {
        if (this.isRawVisible) {
            this.codeElement.textContent = JSON.stringify(this.knowledgeBase, null, 2);
        } else {
            // A more user-friendly, parsed view could be implemented here.
            // For now, we'll just pretty-print the JSON.
            this.codeElement.textContent = JSON.stringify(this.knowledgeBase, null, 2);
        }
        hljs.highlightElement(this.codeElement);
    }
}

customElements.define('system-state', SystemState);
