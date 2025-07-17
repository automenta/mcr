import { tabs } from '../tabs.js';

class App extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
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
				<main>
					${this.renderTabBar()}
					<div class="main-content">
						${this.renderTabPanels()}
					</div>
				</main>
			</div>
		`;
	}

	/**
	 * Renders the tab bar structure.
	 * @returns {string} The HTML string for the tab bar.
	 */
	renderTabBar() {
		const tabButtons = tabs
			.map(
				tab => `
			<button class="tab-button ${tab.id === 'interactive-session' ? 'active' : ''}" data-tab="${tab.id}">
				${tab.icon}
				${tab.name}
			</button>
		`
			)
			.join('');

		return `
			<div class="tab-bar">
				${tabButtons}
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
						<ontology-manager></ontology-manager>
					</div>
					<div class="right-panel">
						<system-state></system-state>
						<graph-visualizer></graph-visualizer>
					</div>
				</div>
			</div>
			<div id="system-analysis" class="tab-panel">
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
			<div id="settings" class="tab-panel">
				<div class="container">
					<h2>Settings</h2>
					<div id="theme-switcher">
						<button id="light-theme-button" title="Light mode">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
								<path d="M10 2a1 1 0 011 1v1.323l3.954 1.582a1 1 0 01.546.922V14.5a1 1 0 01-1.546.833l-3.954-2.372A1 1 0 0110 12.177V18a1 1 0 01-2 0v-5.823a1 1 0 01.454-.833l3.954-2.372L8.454 7.39A1 1 0 018 6.568V5a1 1 0 011-1h1z" />
							</svg>
						</button>
						<button id="dark-theme-button" title="Dark mode">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clip-rule="evenodd" />
							</svg>
						</button>
						<button id="system-theme-button" title="System theme">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
								<path d="M6 10a4 4 0 118 0 4 4 0 01-8 0zM4.33 4.33a6 6 0 108.34 8.34 6 6 0 00-8.34-8.34z" />
							</svg>
						</button>
					</div>
				</div>
			</div>
		`;
	}

	/**
	 * Attaches event listeners to the component's elements.
	 */
	attachEventListeners() {
		this.shadowRoot
			.querySelector('#light-theme-button')
			.addEventListener('click', () => this.setTheme('light'));
		this.shadowRoot
			.querySelector('#dark-theme-button')
			.addEventListener('click', () => this.setTheme('dark'));
		this.shadowRoot
			.querySelector('#system-theme-button')
			.addEventListener('click', () => this.setTheme('system'));

		this.shadowRoot.querySelectorAll('.tab-button').forEach(button => {
			button.addEventListener('click', () => this.handleTabClick(button));
		});
	}

	setTheme(theme) {
		const app = this.shadowRoot.querySelector('#app');
		app.classList.remove('light-mode', 'dark-mode');
		if (theme === 'system') {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			if (prefersDark) {
				app.classList.add('dark-mode');
			} else {
				app.classList.add('light-mode');
			}
		} else if (theme === 'dark') {
			app.classList.add('dark-mode');
		} else {
			app.classList.add('light-mode');
		}
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
