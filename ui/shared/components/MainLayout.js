import './PanelComponent.js';
import './Repl.js';
import './LogDisplay.js';
import './JSONDisplay.js';
import './OntologyManager.js';
import './StrategyManager.js';
import './SystemState.js';

class MainLayout extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}

	connectedCallback() {
		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: grid;
                    grid-template-columns: 350px 1fr 400px;
                    grid-template-rows: 1fr auto;
                    grid-template-areas:
                        "left-panel main-panel right-panel"
                        "footer footer footer";
                    height: 100vh;
                    gap: 1rem;
                    padding: 1rem;
                    box-sizing: border-box;
                }
                #left-panel {
                    grid-area: left-panel;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                #main-panel {
                    grid-area: main-panel;
                    display: flex;
                    flex-direction: column;
                }
                #right-panel {
                    grid-area: right-panel;
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                }
                #footer {
                    grid-area: footer;
                }
                .repl-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
            </style>
            <div id="left-panel">
                <ontology-manager></ontology-manager>
                <strategy-manager></strategy-manager>
            </div>
            <div id="main-panel">
                <div class="repl-container">
                    <mcr-repl></mcr-repl>
                </div>
            </div>
            <div id="right-panel">
                <system-state></system-state>
                <log-display></log-display>
            </div>
            <div id="footer">
                <p>MCR Workbench</p>
            </div>
        `;
	}
}

customElements.define('main-layout', MainLayout);
