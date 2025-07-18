class BiLevelModelDisplay extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 5px;
        }
        h3 {
          margin-top: 0;
        }
      </style>
      <h3>Bi-Level Model Display</h3>
      <div id="content"></div>
    `;
  }

  update(data) {
    const content = this.shadowRoot.getElementById('content');
    content.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
  }
}

customElements.define('bi-level-model-display', BiLevelModelDisplay);
