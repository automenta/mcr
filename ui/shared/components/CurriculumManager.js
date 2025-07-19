import { ManagerComponent } from '@shared/components/ManagerComponent.js';

class CurriculumManager extends ManagerComponent {
  constructor() {
    super();
    this.setAttribute('manager-type', 'Curriculum');
  }
}

customElements.define('curriculum-manager', CurriculumManager);
