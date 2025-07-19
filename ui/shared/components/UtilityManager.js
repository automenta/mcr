import WebSocketService from '@shared/services/WebSocketService.js';

class UtilityManager extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 5px;
        }
        h3 {
          margin-top: 0;
        }
        .form-group {
          margin-bottom: 10px;
        }
        label {
          display: block;
          margin-bottom: 5px;
        }
        input, textarea {
          width: 100%;
          padding: 5px;
          box-sizing: border-box;
        }
        button {
          padding: 5px 10px;
          cursor: pointer;
        }
      </style>
      <div>
        <h3>Utilities</h3>
        <div class="form-group">
          <h4>Generate Ontology</h4>
          <label for="ontology-domain">Domain:</label>
          <input type="text" id="ontology-domain" name="ontology-domain">
          <label for="ontology-instructions">Instructions:</label>
          <textarea id="ontology-instructions" name="ontology-instructions"></textarea>
          <button id="generate-ontology">Generate</button>
        </div>
        <div class="form-group">
          <h4>Generate Examples</h4>
          <label for="example-domain">Domain:</label>
          <input type="text" id="example-domain" name="example-domain">
          <label for="example-instructions">Instructions:</label>
          <textarea id="example-instructions" name="example-instructions"></textarea>
          <button id="generate-examples">Generate</button>
        </div>
      </div>
    `;
  }

  connectedCallback() {
    this.shadowRoot.getElementById('generate-ontology').addEventListener('click', () => {
      const domain = this.shadowRoot.getElementById('ontology-domain').value;
      const instructions = this.shadowRoot.getElementById('ontology-instructions').value;
      WebSocketService.invoke('util.generate_ontology', { domain, instructions });
    });

    this.shadowRoot.getElementById('generate-examples').addEventListener('click', () => {
      const domain = this.shadowRoot.getElementById('example-domain').value;
      const instructions = this.shadowRoot.getElementById('example-instructions').value;
      WebSocketService.invoke('util.generate_example', { domain, instructions });
    });
  }
}

customElements.define('utility-manager', UtilityManager);
