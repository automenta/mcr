class GraphVisualizer extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-top: 1rem;
                    height: 400px;
                }
                h2 {
                    margin-top: 0;
                }
                #graph-container {
                    width: 100%;
                    height: 100%;
                    border: 1px solid #ccc;
                }
            </style>
            <div>
                <h2>Graph Visualizer</h2>
                <div id="graph-container"></div>
            </div>
        `;
        this.container = this.shadowRoot.querySelector('#graph-container');
        this.network = null;
    }

    connectedCallback() {
        document.addEventListener('knowledge-base-updated', this.updateGraph.bind(this));
    }

    updateGraph(event) {
        const knowledgeBase = event.detail.knowledgeBase;
        if (!knowledgeBase) return;

        const nodes = new vis.DataSet();
        const edges = new vis.DataSet();

        const parsedKb = JSON.parse(knowledgeBase);

        if (parsedKb.nodes) {
            nodes.add(parsedKb.nodes);
        }

        if (parsedKb.edges) {
            edges.add(parsedKb.edges);
        }

        const data = { nodes, edges };
        const options = {
            nodes: {
                shape: 'dot',
                size: 16
            },
            physics: {
                forceAtlas2Based: {
                    gravitationalConstant: -26,
                    centralGravity: 0.005,
                    springLength: 230,
                    springConstant: 0.18
                },
                maxVelocity: 146,
                solver: 'forceAtlas2Based',
                timestep: 0.35,
                stabilization: { iterations: 150 }
            }
        };

        if (!this.network) {
            this.network = new vis.Network(this.container, data, options);
        } else {
            this.network.setData(data);
        }
    }
}

customElements.define('graph-visualizer', GraphVisualizer);
