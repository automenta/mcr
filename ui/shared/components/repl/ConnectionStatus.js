class ConnectionStatus extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background-color: var(--panel-bg);
          color: var(--text-color);
          font-family: var(--font-family);
          border-bottom: 1px solid var(--border-color);
        }
        .status-indicator {
          width: 10px;
          height: 10px;
          border-radius: 50%;
        }
        .status-indicator.connected {
          background-color: var(--success-color);
        }
        .status-indicator.disconnected {
          background-color: var(--error-color);
        }
      </style>
      <div id="status-indicator" class="status-indicator"></div>
      <span id="status-message"></span>
    `;

    this.statusIndicator = this.shadowRoot.querySelector('#status-indicator');
    this.statusMessage = this.shadowRoot.querySelector('#status-message');
  }

  set status({ connected, message }) {
    this.statusIndicator.classList.toggle('connected', connected);
    this.statusIndicator.classList.toggle('disconnected', !connected);
    this.statusMessage.textContent = message;
  }
}

customElements.define('connection-status', ConnectionStatus);
