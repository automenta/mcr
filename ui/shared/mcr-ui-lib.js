class WebSocketService {
	constructor(url) {
		this.url = url;
		this.socket = null;
		this.messageId = 0;
		this.listeners = new Map();
		this.pendingRequests = new Map();
	}

	connect() {
		return new Promise((resolve, reject) => {
			if (this.socket && this.socket.readyState === WebSocket.OPEN) {
				resolve();
				return;
			}
			this.socket = new WebSocket(this.url);

			this.socket.onopen = () => {
				console.log('WebSocket connected');
				resolve();
			};

			this.socket.onmessage = event => {
				const message = JSON.parse(event.data);
				if (message.messageId && this.pendingRequests.has(message.messageId)) {
					const { resolve } = this.pendingRequests.get(message.messageId);
					resolve(message);
					this.pendingRequests.delete(message.messageId);
				} else if (this.listeners.has(message.type)) {
					this.listeners
						.get(message.type)
						.forEach(callback => callback(message));
				}
			};

			this.socket.onerror = error => {
				console.error('WebSocket error:', error);
				reject(error);
			};

			this.socket.onclose = () => {
				console.log('WebSocket disconnected');
				this.socket = null;
			};
		});
	}

	invoke(tool, args = {}) {
		return new Promise(resolve => {
			const messageId = `client-msg-${this.messageId++}`;
			const message = {
				type: 'invoke',
				tool,
				args,
				messageId,
			};
			this.socket.send(JSON.stringify(message));
			this.pendingRequests.set(messageId, { resolve });
		});
	}

	subscribe(type, callback) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, []);
		}
		this.listeners.get(type).push(callback);
	}

	unsubscribe(type, callback) {
		if (this.listeners.has(type)) {
			const newListeners = this.listeners.get(type).filter(l => l !== callback);
			if (newListeners.length === 0) {
				this.listeners.delete(type);
			} else {
				this.listeners.set(type, newListeners);
			}
		}
	}
}

const WebSocketManager = new WebSocketService(`ws://${window.location.host}/ws`);
export default WebSocketManager;

class ErrorDisplay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: none;
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          padding: 15px;
          background-color: #f44336;
          color: white;
          border-radius: 5px;
          z-index: 1000;
        }
        :host(.show) {
          display: block;
        }
      </style>
      <div id="error-message"></div>
    `;
  }

  show(message) {
    this.shadowRoot.getElementById('error-message').textContent = message;
    this.classList.add('show');
    setTimeout(() => {
      this.classList.remove('show');
    }, 5000);
  }
}

customElements.define('error-display', ErrorDisplay);

class PanelComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                .panel {
                    background-color: #fff;
                    border: 1px solid #e0e6ed;
                    border-radius: 8px;
                    padding: 1.5rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
                }
            </style>
            <div class="panel">
                <slot></slot>
            </div>
        `;
	}
}

customElements.define('panel-component', PanelComponent);

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
			await WebSocketManager.connect();
			this.addMessage('System', 'Connected to server.');
			const response = await WebSocketManager.invoke('session.create', {});
			this.sessionId = response.payload.data.id;
			this.addMessage('System', `Session created: ${this.sessionId}`);
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

		WebSocketManager.invoke('mcr.handle', {
			sessionId: this.sessionId,
			naturalLanguageText: message,
		}).then(this.handleResponse.bind(this));

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

class SystemState extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                }
                pre {
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    background-color: #f9fafb;
                    padding: 1rem;
                    border-radius: 6px;
                }
                .controls {
                    margin-bottom: 1rem;
                }
                button {
                    padding: 0.5rem 1rem;
                    border: 1px solid #d1d5db;
                    background-color: #fff;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                button:hover {
                    background-color: #f3f4f6;
                }
            </style>
            <panel-component>
                <div>
                    <h2>Knowledge Base</h2>
                    <div class="controls">
                        <button id="toggle-raw">Show Raw</button>
                    </div>
                    <pre><code class="language-json"></code></pre>
                </div>
            </panel-component>
        `;
		this.codeElement = this.shadowRoot.querySelector('code');
		this.toggleButton = this.shadowRoot.querySelector('#toggle-raw');

		this.isRawVisible = false;
		this.knowledgeBase = {};

		this.toggleButton.addEventListener('click', this.toggleRaw.bind(this));
	}

	connectedCallback() {
		document.addEventListener(
			'knowledge-base-updated',
			this.updateKnowledgeBase.bind(this)
		);
	}

	updateKnowledgeBase(event) {
		this.knowledgeBase = event.detail.knowledgeBase;
		this.render();
	}

	toggleRaw() {
		this.isRawVisible = !this.isRawVisible;
		this.toggleButton.textContent = this.isRawVisible
			? 'Show Parsed'
			: 'Show Raw';
		this.render();
	}

	render() {
		if (this.isRawVisible) {
			this.codeElement.textContent = this.knowledgeBase;
		} else {
			try {
				const kb = JSON.parse(this.knowledgeBase);
				let html = '<ul>';
				for (const predicate in kb) {
					html += `<li><strong>${predicate}</strong></li>`;
					html += '<ul>';
					kb[predicate].forEach(args => {
						html += `<li>${predicate}(${args.join(', ')}).</li>`;
					});
					html += '</ul>';
				}
				html += '</ul>';
				this.codeElement.innerHTML = html;
			} catch (e) {
				this.codeElement.textContent = this.knowledgeBase;
			}
		}
		if (typeof hljs !== 'undefined') {
			hljs.highlightElement(this.codeElement);
		}
	}
}

customElements.define('system-state', SystemState);
