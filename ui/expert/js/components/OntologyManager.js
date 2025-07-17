import WebSocketService from '../../../src/WebSocketService.js';

class OntologyManager extends HTMLElement {
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
            </style>
            <div>
                <h2>Ontology Manager</h2>
                <div class="controls">
                    <select id="ontology-select"></select>
                    <div>
                        <button id="create-ontology">Create</button>
                        <button id="delete-ontology">Delete</button>
                    </div>
                </div>
                <textarea id="ontology-display" placeholder="Select an ontology to view its content..."></textarea>
                <button id="update-ontology">Update Ontology</button>
            </div>
        `;

        this.select = this.shadowRoot.querySelector('#ontology-select');
        this.createButton = this.shadowRoot.querySelector('#create-ontology');
        this.deleteButton = this.shadowRoot.querySelector('#delete-ontology');
        this.display = this.shadowRoot.querySelector('#ontology-display');
        this.updateButton = this.shadowRoot.querySelector('#update-ontology');

        this.select.addEventListener('change', this.onOntologySelected.bind(this));
        this.createButton.addEventListener('click', this.createOntology.bind(this));
        this.deleteButton.addEventListener('click', this.deleteOntology.bind(this));
        this.updateButton.addEventListener('click', this.updateOntology.bind(this));
    }

    connectedCallback() {
        WebSocketService.connect().then(() => {
            this.listOntologies();
        });
    }

    listOntologies() {
        WebSocketService.sendMessage('ontology.list', {}, (response) => {
            if (response.payload.success) {
                this.updateOntologyList(response.payload.data);
            }
        });
    }

    updateOntologyList(ontologies) {
        this.select.innerHTML = '<option value="">Select an ontology</option>';
        ontologies.forEach(ontology => {
            const option = document.createElement('option');
            option.value = ontology.id;
            option.textContent = ontology.id;
            this.select.appendChild(option);
        });
    }

    onOntologySelected() {
        const ontologyId = this.select.value;
        if (!ontologyId) {
            this.display.value = '';
            return;
        }

        WebSocketService.sendMessage('ontology.get', { id: ontologyId }, (response) => {
            if (response.payload.success) {
                this.display.value = response.payload.data.content;
            }
        });
    }

    createOntology() {
        const ontologyId = prompt('Enter a name for the new ontology:');
        if (!ontologyId) return;

        WebSocketService.sendMessage('ontology.create', { id: ontologyId, content: '' }, (response) => {
            if (response.payload.success) {
                this.listOntologies();
            } else {
                alert(`Error creating ontology: ${response.payload.error}`);
            }
        });
    }

    deleteOntology() {
        const ontologyId = this.select.value;
        if (!ontologyId) return;

        if (confirm(`Are you sure you want to delete the ontology "${ontologyId}"?`)) {
            WebSocketService.sendMessage('ontology.delete', { id: ontologyId }, (response) => {
                if (response.payload.success) {
                    this.listOntologies();
                    this.display.value = '';
                } else {
                    alert(`Error deleting ontology: ${response.payload.error}`);
                }
            });
        }
    }

    updateOntology() {
        const ontologyId = this.select.value;
        if (!ontologyId) return;

        const content = this.display.value;
        WebSocketService.sendMessage('ontology.update', { id: ontologyId, content }, (response) => {
            if (response.payload.success) {
                alert('Ontology updated successfully.');
            } else {
                alert(`Error updating ontology: ${response.payload.error}`);
            }
        });
    }
}

customElements.define('ontology-manager', OntologyManager);
