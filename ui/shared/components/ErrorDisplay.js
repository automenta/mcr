export class ErrorDisplay extends HTMLElement {
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
