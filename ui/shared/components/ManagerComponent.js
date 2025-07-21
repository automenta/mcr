import { McrConnection } from '../services/McrConnection.js';
import './ErrorDisplay.js';
import { PanelComponent } from './PanelComponent.js';

export class ManagerComponent extends PanelComponent {
	constructor() {
		super();
		this.api = new McrConnection();
	}

	async connectedCallback() {
		super.connectedCallback();
		this.managerType = this.getAttribute('manager-type');
		this.title = `${this.managerType} Manager`;
		this.listItems();
		this.api.subscribe('error', error => {
			this.showError(error);
		});
	}

	get template() {
		return `
      <style>
        :host {
          display: block;
        }
        .loading {
          display: none;
        }
        :host([loading]) .loading {
          display: block;
        }
      </style>
      <div class="loading">Loading...</div>
      <error-display></error-display>
      <slot></slot>
    `;
	}

	render() {
		super.render();
		const slot = this.shadowRoot.querySelector('slot');
		const newContent = document.createElement('div');
		newContent.innerHTML = this.template;
		slot.replaceWith(newContent);
	}

	async listItems() {
		this.showError('');
		try {
			const result = await this.api.invoke(
				`${this.managerType.toLowerCase()}.list`,
				{},
				loading => this.toggleAttribute('loading', loading)
			);
			this.updateItemList(result);
		} catch {
			// The error is already displayed by the error handler
		}
	}

	updateItemList() {
		// To be implemented by subclasses
	}

	showError(message) {
		const errorDisplay = this.querySelector('error-display');
		if (errorDisplay) {
			errorDisplay.show(message);
		}
	}
}

customElements.define('manager-component', ManagerComponent);
