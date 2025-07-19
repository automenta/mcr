import McrConnection from '@shared/services/McrConnection.js';
import './ErrorDisplay.js';

class EvaluationManager extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-top: 1rem;
                }
                h2 {
                    margin-top: 0;
                }
                .loading {
                    display: none;
                }
                :host([loading]) .loading {
                    display: block;
                }
            </style>
            <div>
                <h2>Evaluation Manager</h2>
                <error-display></error-display>
                <div class="loading">Loading...</div>
                <button>Run Evaluation</button>
            </div>
        `;

        this.errorDisplay = this.shadowRoot.querySelector('error-display');
        this.button = this.shadowRoot.querySelector('button');
        this.button.addEventListener('click', this.runEvaluation.bind(this));
        this.api = new McrConnection();
    }

    async connectedCallback() {
        await this.api.connect();
        this.api.subscribe('error', (error) => {
            this.errorDisplay.textContent = error;
        });
    }

    async runEvaluation() {
        this.errorDisplay.textContent = '';
        try {
            const results = await this.api.invoke('evaluation.run', {}, (loading) => this.toggleAttribute('loading', loading));
            document.dispatchEvent(
                new CustomEvent('evaluation-results-updated', {
                    detail: {
                        results,
                    },
                })
            );
        } catch (err) {
            // The error is already displayed by the error handler
        }
    }
}

customElements.define('evaluation-manager', EvaluationManager);
