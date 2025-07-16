import WebSocketService from '../WebSocketService.js';

class StrategyManager extends HTMLElement {
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
                select {
                    width: 100%;
                }
            </style>
            <div>
                <h2>Strategy Manager</h2>
                <select></select>
            </div>
        `;

        this.select = this.shadowRoot.querySelector('select');
    }

    connectedCallback() {
        WebSocketService.connect().then(() => {
            WebSocketService.listStrategies((response) => {
                this.updateStrategies(response.payload.data);
            });
        });
    }

    updateStrategies(strategies) {
        this.select.innerHTML = '';
        strategies.forEach(strategy => {
            const option = document.createElement('option');
            option.value = strategy.id;
            option.textContent = strategy.name;
            this.select.appendChild(option);
        });
    }
}

customElements.define('strategy-manager', StrategyManager);
