import McrConnection from '../services/McrConnection.js';
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
    await this.api.connect();
    this.listItems();
    this.api.subscribe('error', (error) => {
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
      <slot></slot>
    `;
  }

  render() {
    super.render();
    this.innerHTML = this.template;
  }

  async listItems() {
    this.showError('');
    try {
        const items = await this.api.invoke(`${this.managerType.toLowerCase()}.list`, {}, (loading) => this.toggleAttribute('loading', loading));
        this.updateItemList(items);
    } catch (error) {
        // The error is already displayed by the error handler
    }
  }

  updateItemList(items) {
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
