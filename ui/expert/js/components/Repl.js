import WebSocketService from '../WebSocketService.js';

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
                    border: 1px solid #ccc;
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
                }
                button {
                    padding: 0.5rem 1rem;
                }
            </style>
            <div class="repl-container">
                <div class="messages"></div>
                <div class="input-container">
                    <input type="text" placeholder="Enter your message...">
                    <button>Send</button>
                </div>
            </div>
        `;

        this.messagesContainer = this.shadowRoot.querySelector('.messages');
        this.input = this.shadowRoot.querySelector('input');
        this.button = this.shadowRoot.querySelector('button');

        this.button.addEventListener('click', this.sendMessage.bind(this));
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    connectedCallback() {
        WebSocketService.connect()
            .then(() => {
                this.addMessage('System', 'Connected to server.');
                WebSocketService.sendMessage('session.create', {}, (response) => {
                    this.sessionId = response.payload.data.id;
                    this.addMessage('System', `Session created: ${this.sessionId}`);
                });
            })
            .catch(err => {
                this.addMessage('System', 'Failed to connect to server.');
                console.error(err);
            });
    }

    sendMessage() {
        const message = this.input.value;
        if (!message) return;

        this.addMessage('User', message);
        WebSocketService.sendMessage('mcr.handle', {
            sessionId: this.sessionId,
            naturalLanguageText: message,
        }, this.handleResponse.bind(this));

        this.input.value = '';
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
            document.dispatchEvent(new CustomEvent('knowledge-base-updated', {
                detail: {
                    knowledgeBase: payload.fullKnowledgeBase
                }
            }));
        } else {
            this.addMessage('System', `Error: ${payload.error} - ${payload.details}`);
        }
    }

    addMessage(sender, text) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender === 'User' ? 'user-message' : 'system-message');
        messageElement.textContent = `${sender}: ${text}`;
        this.messagesContainer.appendChild(messageElement);
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
}

customElements.define('repl-component', ReplComponent);
