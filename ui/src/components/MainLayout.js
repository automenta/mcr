import '@shared/components/PanelComponent.js';
import '@shared/components/Repl.js';
import '@shared/components/OntologyManager.js';
import '@shared/components/StrategyManager.js';
import '@shared/components/SystemState.js';
import '@shared/components/LogDisplay.js';

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
                    grid-template-rows: 1fr;
                    grid-template-areas: "left-panel main-panel right-panel";
                    height: 100vh;
                    gap: 1rem;
                    padding: 1rem;
                    box-sizing: border-box;
                }
                #left-panel, #main-panel, #right-panel {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    overflow: hidden;
                }
                #left-panel { grid-area: left-panel; }
                #main-panel { grid-area: main-panel; }
                #right-panel { grid-area: right-panel; }
                mcr-repl {
                    height: 100%;
                }
            </style>
            <div id="left-panel">
                <ontology-manager></ontology-manager>
                <strategy-manager></strategy-manager>
            </div>
            <div id="main-panel">
                <mcr-repl></mcr-repl>
            </div>
            <div id="right-panel">
                <system-state></system-state>
                <log-display></log-display>
            </div>
        `;
    }
}

customElements.define('main-layout', MainLayout);
