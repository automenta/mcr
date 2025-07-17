import WebSocketService from '../services/WebSocketService.js';

class StrategyManager extends HTMLElement {
	constructor() {
		super();
		this.strategies = [];
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
                .controls {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 1rem;
                }
                #strategy-details {
                    white-space: pre-wrap;
                    background-color: #f4f4f4;
                    padding: 1rem;
                    border: 1px solid #ccc;
                    margin-top: 1rem;
                }
            </style>
            <div>
                <h2>Strategy Manager</h2>
                <select></select>
                <div class="controls">
                    <button id="set-active-strategy">Set Active</button>
                    <button id="view-strategy-details">View Details</button>
                </div>
                <div id="strategy-details" style="display: none;"></div>

                <h3 style="margin-top: 2rem;">Evolution Engine</h3>
                <div class="controls">
                    <button id="start-optimizer">Start Optimizer</button>
                    <button id="stop-optimizer">Stop Optimizer</button>
                </div>
            </div>
        `;

		this.select = this.shadowRoot.querySelector('select');
		this.setActiveButton = this.shadowRoot.querySelector(
			'#set-active-strategy'
		);
		this.viewDetailsButton = this.shadowRoot.querySelector(
			'#view-strategy-details'
		);
		this.strategyDetails = this.shadowRoot.querySelector('#strategy-details');
		this.startOptimizerButton =
			this.shadowRoot.querySelector('#start-optimizer');
		this.stopOptimizerButton = this.shadowRoot.querySelector('#stop-optimizer');

		this.select.addEventListener('change', this.onStrategySelected.bind(this));
		this.setActiveButton.addEventListener(
			'click',
			this.setActiveStrategy.bind(this)
		);
		this.viewDetailsButton.addEventListener(
			'click',
			this.viewStrategyDetails.bind(this)
		);
		this.startOptimizerButton.addEventListener(
			'click',
			this.startOptimizer.bind(this)
		);
		this.stopOptimizerButton.addEventListener(
			'click',
			this.stopOptimizer.bind(this)
		);
	}

	connectedCallback() {
		WebSocketService.connect().then(() => {
			this.listStrategies();
		});
	}

	listStrategies() {
		WebSocketService.sendMessage('strategy.list', {}, response => {
			if (response.payload.success) {
				this.strategies = response.payload.data;
				this.updateStrategies(this.strategies);
			}
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

	onStrategySelected() {
		this.strategyDetails.style.display = 'none';
	}

	setActiveStrategy() {
		const strategyId = this.select.value;
		if (!strategyId) return;

		WebSocketService.sendMessage(
			'strategy.setActive',
			{ id: strategyId },
			response => {
				if (response.payload.success) {
					alert('Active strategy set successfully.');
				} else {
					alert(`Error setting active strategy: ${response.payload.error}`);
				}
			}
		);
	}

	viewStrategyDetails() {
		const strategyId = this.select.value;
		if (!strategyId) return;

		const strategy = this.strategies.find(s => s.id === strategyId);
		if (strategy) {
			this.strategyDetails.textContent = JSON.stringify(strategy, null, 2);
			this.strategyDetails.style.display = 'block';
		}
	}

	startOptimizer() {
		WebSocketService.sendMessage('evolution.start', {}, response => {
			if (response.payload.success) {
				alert('Evolution optimizer started.');
			} else {
				alert(`Error starting optimizer: ${response.payload.error}`);
			}
		});
	}

	stopOptimizer() {
		WebSocketService.sendMessage('evolution.stop', {}, response => {
			if (response.payload.success) {
				alert('Evolution optimizer stopped.');
			} else {
				alert(`Error stopping optimizer: ${response.payload.error}`);
			}
		});
	}
}

customElements.define('strategy-manager', StrategyManager);
