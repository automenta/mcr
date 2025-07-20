import { ManagerComponent } from './ManagerComponent.js';

class OntologyManager extends ManagerComponent {
	constructor() {
		super();
		this.setAttribute('manager-type', 'Ontology');
	}

	get template() {
		return `
      ${super.template}
      <error-display></error-display>
      <div class="controls">
        <select id="item-select"></select>
        <div>
          <button id="create-item">Create</button>
          <button id="delete-item">Delete</button>
        </div>
      </div>
      <textarea id="item-display" placeholder="Select an item to view its content..."></textarea>
      <button id="update-item">Update</button>
    `;
	}

	render() {
		super.render();
		this.querySelector('#item-select').addEventListener(
			'change',
			this.onItemSelected.bind(this)
		);
		this.querySelector('#create-item').addEventListener(
			'click',
			this.createItem.bind(this)
		);
		this.querySelector('#delete-item').addEventListener(
			'click',
			this.deleteItem.bind(this)
		);
		this.querySelector('#update-item').addEventListener(
			'click',
			this.updateItem.bind(this)
		);
	}

	updateItemList(items) {
		const select = this.querySelector('#item-select');
		select.innerHTML = `<option value="">Select an ${this.managerType.toLowerCase()}</option>`;
		items.forEach(item => {
			const option = document.createElement('option');
			option.value = item.id;
			option.textContent = item.name || item.id;
			select.appendChild(option);
		});
	}

	async onItemSelected() {
		const itemId = this.querySelector('#item-select').value;
		const display = this.querySelector('#item-display');
		if (!itemId) {
			display.value = '';
			return;
		}

		this.showError('');
		try {
			const item = await this.api.invoke(
				`${this.managerType.toLowerCase()}.get`,
				{ id: itemId },
				loading => this.toggleAttribute('loading', loading)
			);
			display.value = item.content;
		} catch (error) {
			// The error is already displayed by the error handler
		}
	}

	async createItem() {
		const itemName = prompt(
			`Enter a name for the new ${this.managerType.toLowerCase()}:`
		);
		if (!itemName) return;

		this.showError('');
		try {
			await this.api.invoke(
				`${this.managerType.toLowerCase()}.create`,
				{ id: itemName, content: '' },
				loading => this.toggleAttribute('loading', loading)
			);
			this.listItems();
		} catch (error) {
			// The error is already displayed by the error handler
		}
	}

	async deleteItem() {
		const itemId = this.querySelector('#item-select').value;
		if (!itemId) return;

		if (
			confirm(
				`Are you sure you want to delete the ${this.managerType.toLowerCase()} "${itemId}"?`
			)
		) {
			this.showError('');
			try {
				await this.api.invoke(
					`${this.managerType.toLowerCase()}.delete`,
					{ id: itemId },
					loading => this.toggleAttribute('loading', loading)
				);
				this.listItems();
				this.querySelector('#item-display').value = '';
			} catch (error) {
				// The error is already displayed by the error handler
			}
		}
	}

	async updateItem() {
		const itemId = this.querySelector('#item-select').value;
		if (!itemId) return;

		const content = this.querySelector('#item-display').value;
		this.showError('');
		try {
			await this.api.invoke(
				`${this.managerType.toLowerCase()}.update`,
				{ id: itemId, content },
				loading => this.toggleAttribute('loading', loading)
			);
			alert(`${this.managerType} updated successfully.`);
		} catch (error) {
			// The error is already displayed by the error handler
		}
	}
}

customElements.define('ontology-manager', OntologyManager);
