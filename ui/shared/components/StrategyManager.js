import { ManagerComponent } from '@shared/components/ManagerComponent.js';

class StrategyManager extends ManagerComponent {
  constructor() {
    super();
    this.setAttribute('manager-type', 'Strategy');
  }
}

customElements.define('strategy-manager', StrategyManager);
