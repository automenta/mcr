export class MessageInput extends HTMLElement {
	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
            <link rel="stylesheet" href="/shared/css/variables.css">
            <style>
                .input-container {
                    display: flex;
                }
                input {
                    flex-grow: 1;
                    padding: 0.75rem;
                    border: 1px solid var(--border-color);
                    border-radius: var(--border-radius) 0 0 var(--border-radius);
                    background-color: #333;
                    color: var(--text-color);
                    font-family: var(--font-family-mono);
                }
                button {
                    padding: 0.75rem 1.25rem;
                    border: 1px solid var(--accent-color);
                    background-color: var(--accent-color);
                    color: #fff;
                    border-radius: 0 var(--border-radius) var(--border-radius) 0;
                    cursor: pointer;
                    transition: background-color 0.3s;
                }
                button:hover {
                    background-color: var(--accent-hover);
                }
            </style>
            <div class="input-container">
                <input type="text" placeholder="Enter command...">
                <button>Send</button>
            </div>
        `;

		this.input = this.shadowRoot.querySelector('input');
		this.button = this.shadowRoot.querySelector('button');

		this.button.addEventListener('click', () =>
			this.dispatchEvent(new CustomEvent('send', { detail: this.input.value }))
		);
		this.input.addEventListener('keydown', e => {
			if (e.key === 'Enter') {
				this.dispatchEvent(
					new CustomEvent('send', { detail: this.input.value })
				);
			} else if (e.key === 'ArrowUp') {
				this.dispatchEvent(new CustomEvent('history-back'));
			} else if (e.key === 'ArrowDown') {
				this.dispatchEvent(new CustomEvent('history-forward'));
			}
		});
	}

	get value() {
		return this.input.value;
	}

	set value(value) {
		this.input.value = value;
	}

	clear() {
		this.input.value = '';
	}
}

customElements.define('message-input', MessageInput);
