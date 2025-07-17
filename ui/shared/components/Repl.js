import WebSocketService from '../services/WebSocketService.js';

class ReplComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                .repl-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                .messages {
                    flex-grow: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    background-color: #f9fafb;
                    border-radius: 6px;
                    margin-bottom: 1rem;
                }
                .message {
                    margin-bottom: 0.5rem;
                }
                .user-message {
                    text-align: right;
                }
                .system-message {
                    white-space: pre-wrap;
                }
                .input-container {
                    display: flex;
                }
                input {
                    flex-grow: 1;
                    padding: 0.5rem;
                    border: 1px solid #d1d5db;
                    border-radius: 6px 0 0 6px;
                }
                button {
                    padding: 0.5rem 1rem;
                    border: 1px solid #4f46e5;
                    background-color: #4f46e5;
                    color: #fff;
                    border-radius: 0 6px 6px 0;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                button:hover {
                    background-color: #4338ca;
                }
                .controls {
                    display: flex;
                    justify-content: flex-end;
                    margin-bottom: 1rem;
                }
            </style>
            <panel-component>
                <div class="repl-container">
                    <div class="controls">
                        <button id="clear-repl">Clear</button>
                    </div>
                    <div class="messages"></div>
                    <div class="input-container">
                        <input type="text" placeholder="Enter your message...">
                        <button>Send</button>
                    </div>
                </div>
            </panel-component>
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
		messageElement.textContent = `${sender}: ${text}`;
		this.messagesContainer.appendChild(messageElement);
		this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
	}
}

customElements.define('repl-component', ReplComponent);
