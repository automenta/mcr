import { CrudManagerComponent } from './CrudManagerComponent.js';

class StrategyManager extends CrudManagerComponent {
	constructor() {
		super();
		this.setAttribute('manager-type', 'Strategy');
	}
}

customElements.define('strategy-manager', StrategyManager);
