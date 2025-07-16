import WebSocketService from '../WebSocketService.js';

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
            </style>
            <div>
                <h2>Evaluation Manager</h2>
                <button>Run Evaluation</button>
            </div>
        `;

        this.button = this.shadowRoot.querySelector('button');
        this.button.addEventListener('click', this.runEvaluation.bind(this));
    }

    runEvaluation() {
        WebSocketService.runEvaluation((response) => {
            console.log('Evaluation result:', response);
            document.dispatchEvent(new CustomEvent('evaluation-results-updated', {
                detail: {
                    results: response.payload.data
                }
            }));
        });
    }
}

customElements.define('evaluation-manager', EvaluationManager);
