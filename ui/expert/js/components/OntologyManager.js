import WebSocketService from '../WebSocketService.js';

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
                }
            </style>
            <div>
                <h2>Ontology Manager</h2>
                <textarea placeholder="Enter ontology..."></textarea>
                <button>Load Ontology</button>
            </div>
        `;

        this.textarea = this.shadowRoot.querySelector('textarea');
        this.button = this.shadowRoot.querySelector('button');

        this.button.addEventListener('click', this.loadOntology.bind(this));
    }

    loadOntology() {
        const ontology = this.textarea.value;
        if (!ontology) return;

        WebSocketService.loadOntology(ontology, (response) => {
            console.log('Ontology loaded:', response);
        });
    }
}

customElements.define('ontology-manager', OntologyManager);
