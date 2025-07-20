import { McrConnection } from '../services/McrConnection.js';
import { MessageHandler } from '../services/MessageHandler.js';
import './MessageDisplay.js';
import './MessageInput.js';
import './repl/ConnectionStatus.js';
import './repl/LoadingIndicator.js';

export class Repl extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="/shared/css/variables.css">
            <style>
                .repl-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background-color: var(--panel-bg);
                    color: var(--text-color);
                    font-family: var(--font-family);
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius);
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    padding: 1rem;
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
                <connection-status></connection-status>
                <div class="controls">
                    <button id="clear-repl">Clear</button>
                </div>
                <message-display></message-display>
                <loading-indicator></loading-indicator>
                <message-input></message-input>
            </div>
        `;

		this.messageDisplay = this.shadowRoot.querySelector('message-display');
		this.messageInput = this.shadowRoot.querySelector('message-input');
		this.clearButton = this.shadowRoot.querySelector('#clear-repl');
        this.connectionStatus = this.shadowRoot.querySelector('connection-status');
        this.loadingIndicator = this.shadowRoot.querySelector('loading-indicator');

		this.history = [];
		this.historyIndex = -1;

		this.messageInput.addEventListener('send', this.sendMessage.bind(this));
		this.messageInput.addEventListener(
			'history-back',
			this.historyBack.bind(this)
		);
		this.messageInput.addEventListener(
			'history-forward',
			this.historyForward.bind(this)
		);
		this.clearButton.addEventListener('click', this.clearRepl.bind(this));
		this.mcrConnection = new McrConnection();
	}

	async connectedCallback() {
		try {
			await this.mcrConnection.connectionPromise;
            this.sessionId = this.mcrConnection.sessionId;
            this.messageHandler = new MessageHandler(this.sessionId);
			this.connectionStatus.status = { connected: true, message: `Session created: ${this.sessionId}` };
		} catch (err) {
			this.connectionStatus.status = { connected: false, message: 'Failed to connect to server.' };
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

	async sendMessage(e) {
		const message = e.detail;
		if (!message) return;

		this.messageDisplay.addMessage('User', message);
		this.history.push(message);
		this.historyIndex = this.history.length;

        this.loadingIndicator.show();

		try {
            const response = await this.messageHandler.sendMessage(message);
            this.handleResponse(response);
        } catch (err) {
            this.handleError(err);
        } finally {
            this.loadingIndicator.hide();
        }


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
            this.handleError(payload);
		}
	}

    handleError(error) {
        let errorMessage = `Error: ${error.error}`;
        if (error.details) {
            errorMessage += ` - ${error.details}`;
        }
        document.dispatchEvent(new CustomEvent('show-error', { detail: errorMessage }));
    }
}

customElements.define('mcr-repl', Repl);
