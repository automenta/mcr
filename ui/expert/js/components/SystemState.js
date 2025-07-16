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
            </style>
            <div>
                <h2>Knowledge Base</h2>
                <pre><code></code></pre>
            </div>
        `;
        this.codeElement = this.shadowRoot.querySelector('code');
    }

    connectedCallback() {
        document.addEventListener('knowledge-base-updated', this.updateKnowledgeBase.bind(this));
    }

    updateKnowledgeBase(event) {
        this.codeElement.textContent = event.detail.knowledgeBase;
    }
}

customElements.define('system-state', SystemState);
