class App extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.isExpertMode = false;

		this.render();

		this.shadowRoot
			.querySelector('#expert-mode-toggle')
			.addEventListener('click', () => {
				this.isExpertMode = !this.isExpertMode;
				this.shadowRoot.querySelector('#app').classList.toggle('expert-mode');
			});

		this.shadowRoot.querySelectorAll('.tab-button').forEach(button => {
			button.addEventListener('click', () => {
				this.shadowRoot
					.querySelectorAll('.tab-button')
					.forEach(btn => btn.classList.remove('active'));
				button.classList.add('active');

				const tab = button.getAttribute('data-tab');
				this.shadowRoot.querySelectorAll('.tab-panel').forEach(panel => {
					if (panel.id === tab) {
						panel.classList.add('active');
					} else {
						panel.classList.remove('active');
					}
				});
			});
		});
	}

	render() {
		this.shadowRoot.innerHTML = `
            <style>
                @import url('../shared/style.css');
            </style>
            <div id="app">
                <header>
                    <h1>MCR Interface</h1>
                    <button id="expert-mode-toggle">Expert Mode</button>
                </header>
                <main>
                    <div class="tab-bar expert-only">
                        <button class="tab-button active" data-tab="interactive-session">
                            Interactive Session
                        </button>
                        <button class="tab-button" data-tab="system-analysis">
                            System Analysis
                        </button>
                        <button class="tab-button" data-tab="settings">Settings</button>
                    </div>
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
                        <!-- Settings components will go here -->
                    </div>
                </main>
            </div>
        `;
	}
}

customElements.define('app-component', App);
