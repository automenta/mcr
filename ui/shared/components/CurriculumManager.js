import { CrudManagerComponent } from './CrudManagerComponent.js';

class CurriculumManager extends CrudManagerComponent {
	constructor() {
		super();
		this.setAttribute('manager-type', 'Curriculum');
	}
}

customElements.define('curriculum-manager', CurriculumManager);
