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
            </style>
            <div>
                <h2>Evaluation Results</h2>
                <canvas id="results-chart"></canvas>
            </div>
        `;
        this.chartCanvas = this.shadowRoot.querySelector('#results-chart');
        this.chart = null;
    }

    connectedCallback() {
        document.addEventListener('evaluation-results-updated', this.updateResults.bind(this));
    }

    updateResults(event) {
        const results = event.detail.results;
        const labels = Object.keys(results);
        const data = Object.values(results);

        if (this.chart) {
            this.chart.destroy();
        }

        this.chart = new Chart(this.chartCanvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Evaluation Metrics',
                    data: data,
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

customElements.define('evaluation-results', EvaluationResults);
