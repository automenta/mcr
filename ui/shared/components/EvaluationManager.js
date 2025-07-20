import { ManagerComponent } from './ManagerComponent.js';

class EvaluationManager extends ManagerComponent {
	constructor() {
		super();
		this.setAttribute('manager-type', 'Evaluation');
	}

	get template() {
		return `
            ${super.template}
            <button>Run Evaluation</button>
        `;
	}

	render() {
		super.render();
		const button = this.querySelector('button');
		button.addEventListener('click', this.runEvaluation.bind(this));
	}

	async runEvaluation() {
		this.showError('');
		try {
			const results = await this.api.invoke('evaluation.run', {}, loading =>
				this.toggleAttribute('loading', loading)
			);
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
