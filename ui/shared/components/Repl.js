import McrConnection from '../services/McrConnection.js';
import './MessageDisplay.js';
import './MessageInput.js';

export class Repl extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="../variables.css">
            <style>
                .repl-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background-color: var(--panel-bg);
                    color: var(--text-color);
                    font-family: var(--font-family);
                }
                .controls {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 1rem;
                }
                .controls button {
                    background-color: transparent;
                    color: var(--accent-color);
                    border: 1px solid var(--accent-color);
                    border-radius: var(--border-radius);
                    padding: 0.5rem 1rem;
                    transition: all 0.3s;
                }
                .controls button:hover {
                    background-color: var(--accent-color);
                    color: #fff;
                }
            </style>
            <div class="repl-container">
                <div class="controls">
                    <button id="clear-repl">Clear</button>
                </div>
                <message-display></message-display>
                <message-input></message-input>
            </div>
        `;

		this.messageDisplay = this.shadowRoot.querySelector('message-display');
		this.messageInput = this.shadowRoot.querySelector('message-input');
		this.clearButton = this.shadowRoot.querySelector('#clear-repl');

		this.history = [];
		this.historyIndex = -1;

		this.messageInput.addEventListener('send', this.sendMessage.bind(this));
		this.messageInput.addEventListener('history-back', this.historyBack.bind(this));
		this.messageInput.addEventListener('history-forward', this.historyForward.bind(this));
		this.clearButton.addEventListener('click', this.clearRepl.bind(this));
	}

	async connectedCallback() {
		try {
			await McrConnection.connectionPromise;
			this.messageDisplay.addMessage('System', 'Connected to server.');
			this.sessionId = McrConnection.sessionId;
			this.messageDisplay.addMessage('System', `Session created: ${this.sessionId}`);
		} catch (err) {
			this.messageDisplay.addMessage('System', 'Failed to connect to server.', 'error');
			console.error(err);
		}
	}

	historyBack() {
		if (this.historyIndex > 0) {
			this.historyIndex--;
			this.messageInput.value = this.history[this.historyIndex];
		}
	}

	historyForward() {
		if (this.historyIndex < this.history.length - 1) {
			this.historyIndex++;
			this.messageInput.value = this.history[this.historyIndex];
		} else {
			this.historyIndex = this.history.length;
			this.messageInput.value = '';
		}
	}

	sendMessage(e) {
		const message = e.detail;
		if (!message) return;

		this.messageDisplay.addMessage('User', message);
		this.history.push(message);
		this.historyIndex = this.history.length;

		McrConnection.invoke('mcr.handle', {
			sessionId: this.sessionId,
			naturalLanguageText: message,
		}).then(this.handleResponse.bind(this));

		this.messageInput.clear();
	}

	clearRepl() {
		this.messageDisplay.clear();
	}

	handleResponse(response) {
		const { payload } = response;
		if (payload.success) {
			let content = '';
			if (payload.data && payload.data.answer) {
				content = payload.data.answer;
			} else if (payload.message) {
				content = payload.message;
			} else {
				content = JSON.stringify(payload, null, 2);
			}
			this.messageDisplay.addMessage('System', content);
			document.dispatchEvent(
				new CustomEvent('knowledge-base-updated', {
					detail: {
						knowledgeBase: payload.fullKnowledgeBase,
					},
				})
			);
		} else {
			let errorMessage = `Error: ${payload.error}`;
			if (payload.details) {
				errorMessage += ` - ${payload.details}`;
			}
			this.messageDisplay.addMessage('System', errorMessage, 'error');
		}
	}
}

customElements.define('repl-repl', Repl);
