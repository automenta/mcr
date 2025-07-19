import { ManagerComponent } from '@shared/components/ManagerComponent.js';

class OntologyManager extends ManagerComponent {
  constructor() {
    super();
    this.setAttribute('manager-type', 'Ontology');
  }
}

customElements.define('ontology-manager', OntologyManager);
