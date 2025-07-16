class GraphVisualizer extends HTMLElement {
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
            </style>
            <div>
                <h2>Graph Visualizer</h2>
                <div id="graph-container"></div>
            </div>
        `;
    }
}

customElements.define('graph-visualizer', GraphVisualizer);
