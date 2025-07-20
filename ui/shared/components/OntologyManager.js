import { CrudManagerComponent } from './CrudManagerComponent.js';

class OntologyManager extends CrudManagerComponent {
	constructor() {
		super();
		this.setAttribute('manager-type', 'Ontology');
	}
}

customElements.define('ontology-manager', OntologyManager);
