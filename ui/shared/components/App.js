class App extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.isExpertMode = false;
		this.render();
		this.attachEventListeners();
	}

	/**
	 * Renders the component's HTML structure.
	 */
	render() {
		this.shadowRoot.innerHTML = `
			<style>
				@import url('../shared/style.css');
				@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
			</style>
			<div id="app">
				<header>
					<h1>MCR Interface</h1>
					<button id="expert-mode-toggle">Toggle Expert Mode</button>
				</header>
				<main>
					${this.renderTabBar()}
					${this.renderTabPanels()}
				</main>
				<footer>
					<p>MCR - Multi-strategy Cognitive Reasoning Engine</p>
				</footer>
			</div>
		`;
	}

	/**
	 * Renders the tab bar structure.
	 * @returns {string} The HTML string for the tab bar.
	 */
	renderTabBar() {
		return `
			<div class="tab-bar expert-only">
				<button class="tab-button active" data-tab="interactive-session">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582a1 1 0 01.546.922V14.5a1 1 0 01-1.546.833l-3.954-2.372A1 1 0 0110 12.177V18a1 1 0 01-2 0v-5.823a1 1 0 01.454-.833l3.954-2.372L8.454 7.39A1 1 0 018 6.568V5a1 1 0 011-1h1z" clip-rule="evenodd" /></svg>
					Interactive Session
				</button>
				<button class="tab-button" data-tab="system-analysis">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" /><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.18l.88-1.473a1.65 1.65 0 011.53-.946l1.838.205A1.65 1.65 0 016.22 8.35l.485 1.7a1.65 1.65 0 01-.298 1.6l-.79 1.316a1.65 1.65 0 01-1.982.63l-1.838-.46A1.65 1.65 0 01.664 10.59zM10 15a5 5 0 100-10 5 5 0 000 10zM19.336 10.59a1.651 1.651 0 010-1.18l-.88-1.473a1.65 1.65 0 01-1.53-.946l-1.838-.205A1.65 1.65 0 0113.78 8.35l-.485 1.7a1.65 1.65 0 01.298 1.6l.79 1.316a1.65 1.65 0 011.982.63l1.838-.46a1.65 1.65 0 012.336-1.84z" clip-rule="evenodd" /></svg>
					System Analysis
				</button>
				<button class="tab-button" data-tab="settings">
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
					Settings
				</button>
			</div>
		`;
	}

	/**
	 * Renders the tab panels.
	 * @returns {string} The HTML string for the tab panels.
	 */
	renderTabPanels() {
		return `
			<div id="interactive-session" class="tab-panel active">
				<div class="container">
					<div class="left-panel">
						<repl-component></repl-component>
						<ontology-manager class="expert-only"></ontology-manager>
					</div>
					<div class="right-panel">
						<system-state></system-state>
						<graph-visualizer class="expert-only"></graph-visualizer>
					</div>
				</div>
			</div>
			<div id="system-analysis" class="tab-panel expert-only">
				<div class="container">
					<div class="left-panel">
						<strategy-manager></strategy-manager>
						<evaluation-manager></evaluation-manager>
					</div>
					<div class="right-panel">
						<evaluation-results></evaluation-results>
					</div>
				</div>
			</div>
			<div id="settings" class="tab-panel expert-only">
				<div class="container">
					<h2>Settings</h2>
					<p>Configure application settings here.</p>
				</div>
			</div>
		`;
	}

	/**
	 * Attaches event listeners to the component's elements.
	 */
	attachEventListeners() {
		this.shadowRoot
			.querySelector('#expert-mode-toggle')
			.addEventListener('click', this.toggleExpertMode.bind(this));

		this.shadowRoot.querySelectorAll('.tab-button').forEach(button => {
			button.addEventListener('click', () => this.handleTabClick(button));
		});
	}

	/**
	 * Toggles the expert mode.
	 */
	toggleExpertMode() {
		this.isExpertMode = !this.isExpertMode;
		this.shadowRoot.querySelector('#app').classList.toggle('expert-mode');
	}

	/**
	 * Handles a tab button click.
	 * @param {HTMLElement} clickedButton The button that was clicked.
	 */
	handleTabClick(clickedButton) {
		this.shadowRoot
			.querySelectorAll('.tab-button')
			.forEach(btn => btn.classList.remove('active'));
		clickedButton.classList.add('active');

		const tab = clickedButton.getAttribute('data-tab');
		this.shadowRoot.querySelectorAll('.tab-panel').forEach(panel => {
			panel.classList.toggle('active', panel.id === tab);
		});
	}
}

customElements.define('app-component', App);
