import WebSocketService from '../services/WebSocketService.js';

class ReplComponent extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });

		this.history = [];
		this.historyIndex = -1;
		this.isLoading = false;
		this.sessionId = null;

		this.render();
		this.initDomElements();
		this.attachEventListeners();
	}

	/**
	 * Renders the component's HTML structure.
	 */
	render() {
		this.shadowRoot.innerHTML = `
            <style>
                /* Styles remain the same */
            </style>
            <div class="repl-container">
                <div class="controls">
                    <button id="clear-repl">Clear</button>
                </div>
                <div class="messages"></div>
                <div class="loader">Loading...</div>
                <div class="input-container">
                    <input type="text" placeholder="Enter your message...">
                    <button>Send</button>
                </div>
            </div>
        `;
	}

	/**
	 * Initializes DOM element references.
	 */
	initDomElements() {
		this.messagesContainer = this.shadowRoot.querySelector('.messages');
		this.input = this.shadowRoot.querySelector('input');
		this.button = this.shadowRoot.querySelector('button');
		this.clearButton = this.shadowRoot.querySelector('#clear-repl');
		this.loader = this.shadowRoot.querySelector('.loader');
	}

	/**
	 * Attaches event listeners to the component's elements.
	 */
	attachEventListeners() {
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

	/**
	 * Handles keydown events in the input field.
	 * @param {KeyboardEvent} e The keyboard event.
	 */
	handleKeydown(e) {
		if (e.key === 'Enter') {
			this.sendMessage();
		} else if (e.key === 'ArrowUp') {
			this.navigateHistory('up');
		} else if (e.key === 'ArrowDown') {
			this.navigateHistory('down');
		}
	}

	/**
	 * Navigates through the command history.
	 * @param {'up' | 'down'} direction The direction to navigate.
	 */
	navigateHistory(direction) {
		if (this.history.length === 0) return;

		if (direction === 'up') {
			this.historyIndex = Math.max(0, this.historyIndex - 1);
		} else {
			this.historyIndex = Math.min(
				this.history.length,
				this.historyIndex + 1
			);
		}

		this.input.value =
			this.historyIndex < this.history.length ? this.history[this.historyIndex] : '';
	}

	/**
	 * Sends a message to the server.
	 */
	sendMessage() {
		const message = this.input.value.trim();
		if (!message || this.isLoading) return;

		this.addMessage('User', message);
		if (this.history[this.history.length - 1] !== message) {
			this.history.push(message);
		}
		this.historyIndex = this.history.length;
		this.input.value = '';
		this.setLoading(true);

		WebSocketService.sendMessage(
			'mcr.handle',
			{
				sessionId: this.sessionId,
				naturalLanguageText: message,
			},
			this.handleResponse.bind(this)
		);
	}

	/**
	 * Clears the REPL messages.
	 */
	clearRepl() {
		this.messagesContainer.innerHTML = '';
	}

	/**
	 * Handles the response from the server.
	 * @param {object} response The server response.
	 */
	handleResponse(response) {
		this.setLoading(false);
		const { payload } = response;

		if (payload.success) {
			const content =
				payload.data?.answer ||
				payload.message ||
				JSON.stringify(payload, null, 2);
			this.addMessage('System', content);
			this.dispatchKnowledgeUpdate(payload.fullKnowledgeBase);
		} else {
			const errorMessage = `Error: ${payload.error}${
				payload.details
					? ` - ${JSON.stringify(payload.details, null, 2)}`
					: ''
			}`;
			this.addMessage('System', errorMessage);
		}
	}

	/**
	 * Dispatches an event with the updated knowledge base.
	 * @param {object} knowledgeBase The updated knowledge base.
	 */
	dispatchKnowledgeUpdate(knowledgeBase) {
		document.dispatchEvent(
			new CustomEvent('knowledge-base-updated', {
				detail: { knowledgeBase },
			})
		);
	}

	/**
	 * Adds a message to the REPL interface.
	 * @param {string} sender The message sender ('User' or 'System').
	 * @param {string} text The message text.
	 */
	addMessage(sender, text) {
		const wasScrolledToBottom =
			this.messagesContainer.scrollHeight -
				this.messagesContainer.clientHeight <=
			this.messagesContainer.scrollTop + 1;

		const messageElement = document.createElement('div');
		messageElement.classList.add(
			'message',
			sender === 'User' ? 'user-message' : 'system-message'
		);
		messageElement.textContent = `${sender}: ${text}`;
		this.messagesContainer.appendChild(messageElement);

		if (wasScrolledToBottom) {
			this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
		}
	}

	/**
	 * Sets the loading state of the component.
	 * @param {boolean} isLoading Whether the component is loading.
	 */
	setLoading(isLoading) {
		this.isLoading = isLoading;
		this.loader.style.display = isLoading ? 'block' : 'none';
		this.input.disabled = isLoading;
		this.button.disabled = isLoading;
	}
}

customElements.define('repl-component', ReplComponent);
