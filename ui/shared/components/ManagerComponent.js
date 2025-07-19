import McrConnection from '../services/McrConnection.js';
import './ErrorDisplay.js';

export class ManagerComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          margin-top: 1rem;
        }
        h2 {
          margin-top: 0;
        }
        textarea {
          width: 100%;
          height: 150px;
          margin-top: 1rem;
        }
        .controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        .loading {
          display: none;
        }
        :host([loading]) .loading {
          display: block;
        }
      </style>
      <div>
        <h2 id="manager-title"></h2>
        <error-display></error-display>
        <div class="loading">Loading...</div>
        <div class="controls">
          <select id="item-select"></select>
          <div>
            <button id="create-item">Create</button>
            <button id="delete-item">Delete</button>
          </div>
        </div>
        <textarea id="item-display" placeholder="Select an item to view its content..."></textarea>
        <button id="update-item">Update</button>
      </div>
    `;

    this.titleElement = this.shadowRoot.querySelector('#manager-title');
    this.errorDisplay = this.shadowRoot.querySelector('error-display');
    this.select = this.shadowRoot.querySelector('#item-select');
    this.createButton = this.shadowRoot.querySelector('#create-item');
    this.deleteButton = this.shadowRoot.querySelector('#delete-item');
    this.display = this.shadowRoot.querySelector('#item-display');
    this.updateButton = this.shadowRoot.querySelector('#update-item');

    this.select.addEventListener('change', this.onItemSelected.bind(this));
    this.createButton.addEventListener('click', this.createItem.bind(this));
    this.deleteButton.addEventListener('click', this.deleteItem.bind(this));
    this.updateButton.addEventListener('click', this.updateItem.bind(this));

    this.api = new McrConnection();
  }

  async connectedCallback() {
    this.managerType = this.getAttribute('manager-type');
    this.titleElement.textContent = `${this.managerType} Manager`;
    await this.api.connect();
    this.listItems();
    this.api.subscribe('error', (error) => {
        this.errorDisplay.textContent = error;
    });
  }

  async listItems() {
    this.errorDisplay.textContent = '';
    try {
        const items = await this.api.invoke(`${this.managerType.toLowerCase()}.list`, {}, (loading) => this.toggleAttribute('loading', loading));
        this.updateItemList(items);
    } catch (error) {
        // The error is already displayed by the error handler
    }
  }

  updateItemList(items) {
    this.select.innerHTML = `<option value="">Select an ${this.managerType.toLowerCase()}</option>`;
    items.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name || item.id;
      this.select.appendChild(option);
    });
  }

  async onItemSelected() {
    const itemId = this.select.value;
    if (!itemId) {
      this.display.value = '';
      return;
    }

    this.errorDisplay.textContent = '';
    try {
        const item = await this.api.invoke(`${this.managerType.toLowerCase()}.get`, { id: itemId }, (loading) => this.toggleAttribute('loading', loading));
        this.display.value = item.content;
    } catch (error) {
        // The error is already displayed by the error handler
    }
  }

  async createItem() {
    const itemName = prompt(`Enter a name for the new ${this.managerType.toLowerCase()}:`);
    if (!itemName) return;

    this.errorDisplay.textContent = '';
    try {
        await this.api.invoke(`${this.managerType.toLowerCase()}.create`, { id: itemName, content: '' }, (loading) => this.toggleAttribute('loading', loading));
        this.listItems();
    } catch (error) {
        // The error is already displayed by the error handler
    }
  }

  async deleteItem() {
    const itemId = this.select.value;
    if (!itemId) return;

    if (confirm(`Are you sure you want to delete the ${this.managerType.toLowerCase()} "${itemId}"?`)) {
        this.errorDisplay.textContent = '';
        try {
            await this.api.invoke(`${this.managerType.toLowerCase()}.delete`, { id: itemId }, (loading) => this.toggleAttribute('loading', loading));
            this.listItems();
            this.display.value = '';
        } catch (error) {
            // The error is already displayed by the error handler
        }
    }
  }

    async updateItem() {
        const itemId = this.select.value;
        if (!itemId) return;

        const content = this.display.value;
        this.errorDisplay.textContent = '';
        try {
            await this.api.invoke(`${this.managerType.toLowerCase()}.update`, { id: itemId, content }, (loading) => this.toggleAttribute('loading', loading));
            alert(`${this.managerType} updated successfully.`);
        } catch (error) {
            // The error is already displayed by the error handler
        }
    }
}

customElements.define('manager-component', ManagerComponent);
