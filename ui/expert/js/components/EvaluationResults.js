class EvaluationResults extends HTMLElement {
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
                table {
                    width: 100%;
                    border-collapse: collapse;
                }
                th, td {
                    border: 1px solid #ccc;
                    padding: 0.5rem;
                    text-align: left;
                }
            </style>
            <div>
                <h2>Evaluation Results</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Metric</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                    </tbody>
                </table>
            </div>
        `;
        this.tbody = this.shadowRoot.querySelector('tbody');
    }

    connectedCallback() {
        document.addEventListener('evaluation-results-updated', this.updateResults.bind(this));
    }

    updateResults(event) {
        const results = event.detail.results;
        this.tbody.innerHTML = '';

        for (const metric in results) {
            const row = document.createElement('tr');
            const metricCell = document.createElement('td');
            const valueCell = document.createElement('td');

            metricCell.textContent = metric;
            valueCell.textContent = results[metric];

            row.appendChild(metricCell);
            row.appendChild(valueCell);

            this.tbody.appendChild(row);
        }
    }
}

customElements.define('evaluation-results', EvaluationResults);
