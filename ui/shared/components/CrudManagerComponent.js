import { ManagerComponent } from './ManagerComponent.js';
import './ErrorDisplay.js';

export class CrudManagerComponent extends ManagerComponent {
	constructor() {
		super();
	}

	get template() {
		return `
            ${super.template}
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
		this.shadowRoot.innerHTML = this.template;

		this.shadowRoot
			.querySelector('#item-select')
			.addEventListener('change', this.onItemSelected.bind(this));
		this.shadowRoot
			.querySelector('#create-item')
			.addEventListener('click', this.createItem.bind(this));
		this.shadowRoot
			.querySelector('#delete-item')
			.addEventListener('click', this.deleteItem.bind(this));
		this.shadowRoot
			.querySelector('#update-item')
			.addEventListener('click', this.updateItem.bind(this));
	}

	updateItemList(items) {
		const select = this.shadowRoot.querySelector('#item-select');
		const options = items.map(
			item => `<option value="${item.id}">${item.name || item.id}</option>`
		);
		select.innerHTML = `<option value="">Select a ${this.managerType.toLowerCase()}</option>${options.join('')}`;
	}

	async handleApiCall(operation, args = {}, successCallback = () => {}) {
		this.showError('');
		try {
			const result = await this.api.invoke(
				`${this.managerType.toLowerCase()}.${operation}`,
				args,
				loading => this.toggleAttribute('loading', loading)
			);
			successCallback(result);
		} catch {
			// The error is already displayed by the error handler
		}
	}

	async onItemSelected() {
		const itemId = this.shadowRoot.querySelector('#item-select').value;
		const display = this.shadowRoot.querySelector('#item-display');
		if (!itemId) {
			display.value = '';
			return;
		}

		await this.handleApiCall('get', { id: itemId }, item => {
			display.value = item.content;
		});
	}

	async createItem() {
		const itemName = prompt(
			`Enter a name for the new ${this.managerType.toLowerCase()}:`
		);
		if (!itemName) return;

		await this.handleApiCall('create', { id: itemName, content: '' }, () => {
			this.listItems();
		});
	}

	async deleteItem() {
		const itemId = this.shadowRoot.querySelector('#item-select').value;
		if (!itemId) return;

		if (
			confirm(
				`Are you sure you want to delete the ${this.managerType.toLowerCase()} "${itemId}"?`
			)
		) {
			await this.handleApiCall('delete', { id: itemId }, () => {
				this.listItems();
				this.shadowRoot.querySelector('#item-display').value = '';
			});
		}
	}

	async updateItem() {
		const itemId = this.shadowRoot.querySelector('#item-select').value;
		if (!itemId) return;

		const content = this.shadowRoot.querySelector('#item-display').value;
		await this.handleApiCall('update', { id: itemId, content }, () => {
			alert(`${this.managerType} updated successfully.`);
		});
	}
}

customElements.define('crud-manager-component', CrudManagerComponent);
