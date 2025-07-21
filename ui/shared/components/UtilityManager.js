import { ManagerComponent } from './ManagerComponent.js';

export class UtilityManager extends ManagerComponent {
	constructor() {
		super();
		this.setAttribute('manager-type', 'Utility');
	}

	get template() {
		return `
            ${super.template}
            <div class="form-group">
                <h4>Generate Ontology</h4>
                <label for="ontology-domain">Domain:</label>
                <input type="text" id="ontology-domain" name="ontology-domain">
                <label for="ontology-instructions">Instructions:</label>
                <textarea id="ontology-instructions" name="ontology-instructions"></textarea>
                <button id="generate-ontology">Generate</button>
            </div>
            <div class="form-group">
                <h4>Generate Examples</h4>
                <label for="example-domain">Domain:</label>
                <input type="text" id="example-domain" name="example-domain">
                <label for="example-instructions">Instructions:</label>
                <textarea id="example-instructions" name="example-instructions"></textarea>
                <button id="generate-examples">Generate</button>
            </div>
        `;
	}

	render() {
		super.render();
		this.querySelector('#generate-ontology').addEventListener(
			'click',
			async () => {
				const domain = this.querySelector('#ontology-domain').value;
				const instructions = this.querySelector('#ontology-instructions').value;
				this.showError('');
				try {
					await this.api.invoke(
						'util.generate_ontology',
						{ domain, instructions },
						loading => this.toggleAttribute('loading', loading)
					);
				} catch {
					// The error is already displayed by the error handler
				}
			}
		);

		this.querySelector('#generate-examples').addEventListener(
			'click',
			async () => {
				const domain = this.querySelector('#example-domain').value;
				const instructions = this.querySelector('#example-instructions').value;
				this.showError('');
				try {
					await this.api.invoke(
						'util.generate_example',
						{ domain, instructions },
						loading => this.toggleAttribute('loading', loading)
					);
				} catch {
					// The error is already displayed by the error handler
				}
			}
		);
	}
}

customElements.define('utility-manager', UtilityManager);
