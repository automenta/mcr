import WebSocketService from '../services/WebSocketService.js';

class ReplComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    --bg-color: #1a1a1a;
                    --text-color: #e0e0e0;
                    --panel-bg: #2c2c2c;
                    --border-color: #444;
                    --accent-color: #00aaff;
                    --accent-hover: #0088cc;
                }
                .repl-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background-color: var(--panel-bg);
                    color: var(--text-color);
                }
                .messages {
                    flex-grow: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    background-color: var(--bg-color);
                    border-radius: 6px;
                    margin-bottom: 1rem;
                }
                .message {
                    margin-bottom: 0.75rem;
                    line-height: 1.6;
                }
                .user-message {
                    color: #a0a0a0;
                    text-align: right;
                }
                .system-message {
                    white-space: pre-wrap;
                    background-color: #333;
                    padding: 0.75rem;
                    border-radius: 6px;
                    position: relative;
                }
                .copy-button {
                    position: absolute;
                    top: 0.5rem;
                    right: 0.5rem;
                    background-color: var(--accent-color);
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 0.25rem 0.5rem;
                    cursor: pointer;
                    font-size: 0.8rem;
                    opacity: 0.7;
                    transition: opacity 0.3s;
                }
                .system-message:hover .copy-button {
                    opacity: 1;
                }
                .input-container {
                    display: flex;
                }
                input {
                    flex-grow: 1;
                    padding: 0.75rem;
                    border: 1px solid var(--border-color);
                    border-radius: 6px 0 0 6px;
                    background-color: #333;
                    color: var(--text-color);
                    font-family: 'Roboto Mono', monospace;
                }
                button {
                    padding: 0.75rem 1.25rem;
                    border: 1px solid var(--accent-color);
                    background-color: var(--accent-color);
                    color: #fff;
                    border-radius: 0 6px 6px 0;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                button:hover {
                    background-color: var(--accent-hover);
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
                    border-radius: 6px;
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
                <div class="messages"></div>
                <div class="input-container">
                    <input type="text" placeholder="Enter command...">
                    <button>Send</button>
                </div>
            </div>
        `;

		this.messagesContainer = this.shadowRoot.querySelector('.messages');
		this.input = this.shadowRoot.querySelector('input');
		this.button = this.shadowRoot.querySelector('button');
		this.clearButton = this.shadowRoot.querySelector('#clear-repl');

		this.history = [];
		this.historyIndex = -1;

		this.button.addEventListener('click', this.sendMessage.bind(this));
		this.input.addEventListener('keydown', this.handleKeydown.bind(this));
		this.clearButton.addEventListener('click', this.clearRepl.bind(this));
	}

	async connectedCallback() {
		try {
			await WebSocketService.connect();
			this.addMessage('System', 'Connected to server.');
			WebSocketService.sendMessage('session.create', {}, response => {
				this.sessionId = response.payload.data.id;
				this.addMessage('System', `Session created: ${this.sessionId}`);
			});
		} catch (err) {
			this.addMessage('System', 'Failed to connect to server.');
			console.error(err);
		}
	}

	handleKeydown(e) {
		if (e.key === 'Enter') {
			this.sendMessage();
		} else if (e.key === 'ArrowUp') {
			if (this.historyIndex > 0) {
				this.historyIndex--;
				this.input.value = this.history[this.historyIndex];
			}
		} else if (e.key === 'ArrowDown') {
			if (this.historyIndex < this.history.length - 1) {
				this.historyIndex++;
				this.input.value = this.history[this.historyIndex];
			} else {
				this.historyIndex = this.history.length;
				this.input.value = '';
			}
		}
	}

	sendMessage() {
		const message = this.input.value;
		if (!message) return;

		this.addMessage('User', message);
		this.history.push(message);
		this.historyIndex = this.history.length;

		WebSocketService.sendMessage(
			'mcr.handle',
			{
				sessionId: this.sessionId,
				naturalLanguageText: message,
			},
			this.handleResponse.bind(this)
		);

		this.input.value = '';
	}

	clearRepl() {
		this.messagesContainer.innerHTML = '';
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
			this.addMessage('System', content);
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
			this.addMessage('System', errorMessage);
		}
	}

	addMessage(sender, text) {
		const messageElement = document.createElement('div');
		messageElement.classList.add(
			'message',
			sender === 'User' ? 'user-message' : 'system-message'
		);

		const messageContent = document.createElement('div');
		messageContent.textContent = `${sender}: ${text}`;
		messageElement.appendChild(messageContent);

		if (sender === 'System') {
			const copyButton = document.createElement('button');
			copyButton.textContent = 'Copy';
			copyButton.className = 'copy-button';
			copyButton.onclick = () => {
				navigator.clipboard.writeText(text).then(
					() => {
						copyButton.textContent = 'Copied!';
						setTimeout(() => (copyButton.textContent = 'Copy'), 2000);
					},
					err => {
						console.error('Failed to copy text: ', err);
						copyButton.textContent = 'Error';
						setTimeout(() => (copyButton.textContent = 'Copy'), 2000);
					}
				);
			};
			messageElement.appendChild(copyButton);
		}

		this.messagesContainer.appendChild(messageElement);
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}
}

customElements.define('repl-component', ReplComponent);
