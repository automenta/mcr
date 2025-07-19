export class MessageDisplay extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="../variables.css">
            <style>
                .messages {
                    flex-grow: 1;
                    overflow-y: auto;
                    padding: 1rem;
                    background-color: var(--bg-color);
                    border-radius: var(--border-radius);
                    margin-bottom: 1rem;
                }
                .message {
                    margin-bottom: 0.75rem;
                    line-height: 1.6;
                }
                .user-message {
                    color: var(--user-message-color);
                    text-align: right;
                }
                .system-message {
                    white-space: pre-wrap;
                    background-color: #333;
                    padding: 0.75rem;
                    border-radius: var(--border-radius);
                    position: relative;
                    color: var(--system-message-color);
                }
                .system-message.error {
                    background-color: var(--error-color);
                    color: white;
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
            </style>
            <div class="messages"></div>
        `;
        this.messagesContainer = this.shadowRoot.querySelector('.messages');
    }

    addMessage(sender, text, type = 'normal') {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message');

        let senderIcon = '';
        if (sender === 'User') {
            messageElement.classList.add('user-message');
            senderIcon = '🧑‍💻';
        } else {
            messageElement.classList.add('system-message');
            if (type === 'error') {
                messageElement.classList.add('error');
                senderIcon = '🔥';
            } else {
                senderIcon = '🤖';
            }
        }

        const messageContent = document.createElement('div');
        messageContent.textContent = `${senderIcon} ${sender}: ${text}`;
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

    clear() {
        this.messagesContainer.innerHTML = '';
    }
}

customElements.define('message-display', MessageDisplay);
