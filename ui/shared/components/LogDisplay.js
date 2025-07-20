class LogDisplay extends HTMLElement {
	constructor({ demoName, demoDescription, debug }) {
		super();
		this.attachShadow({ mode: 'open' });
		this.demoName = demoName;
		this.demoDescription = demoDescription;
		this.debug = debug;

		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    margin-bottom: 1rem;
                    border: 1px solid #ccc;
                    border-radius: 4px;
                }
                .header {
                    padding: 0.5rem;
                    background-color: #f0f0f0;
                    border-bottom: 1px solid #ccc;
                }
                .log-container {
                    padding: 0.5rem;
                }
                .log-entry {
                    margin-bottom: 0.5rem;
                    padding: 0.25rem;
                    border-radius: 4px;
                }
                .log-entry.debug {
                    background-color: #f8f8f8;
                }
                .log-entry.error {
                    background-color: #fdd;
                    border: 1px solid #f00;
                }
                .log-entry.success {
                    background-color: #dfd;
                    border: 1px solid #0f0;
                }
            </style>
            <div class="header">
                <h2>${this.demoName}</h2>
                <p>${this.demoDescription}</p>
            </div>
            <div class="log-container"></div>
        `;

		this.logContainer = this.shadowRoot.querySelector('.log-container');
	}

	addLog(level, message, details) {
		const entry = document.createElement('div');
		entry.className = `log-entry ${level}`;

		let content = message;
		if (details) {
			content += ` ${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}`;
		}
		entry.textContent = content;

		if (level === 'debug' && !this.debug) {
			entry.style.display = 'none';
		}

		this.logContainer.appendChild(entry);
	}
}

customElements.define('log-display', LogDisplay);

export default LogDisplay;
