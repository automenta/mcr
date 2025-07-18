import WebSocketService from '@shared/services/WebSocketService.js';

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

	async runEvaluation() {
		try {
			const response = await WebSocketService.invoke('evaluation.run', {});
			console.log('Evaluation result:', response);
			document.dispatchEvent(
				new CustomEvent('evaluation-results-updated', {
					detail: {
						results: response.payload.data,
					},
				})
			);
		} catch (err) {
			console.error('Evaluation failed', err);
		}
	}
}

customElements.define('evaluation-manager', EvaluationManager);
