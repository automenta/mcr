// ui/src/apiService.js
const logger = {
  debug: (...args) => console.debug('[ApiService]', ...args),
  error: (...args) => console.error('[ApiService]', ...args),
  warn: (...args) => console.warn('[ApiService]', ...args),
};

class ApiService {
  constructor() {
    this.socket = null;
    this.connectPromise = null;
    this.eventListeners = new Map();
    this.pendingMessages = new Map();
    this.explicitlyClosed = false;
    this.serverUrl = null;
    this.correlationId = `ui-corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  connect(url = window.MCR_WEBSOCKET_URL || 'ws://0.0.0.0:8080/ws') {
    if (this.connectPromise) {
      logger.debug('[ApiService] Connection attempt already in progress, returning existing promise.');
      return this.connectPromise;
    }

    this.serverUrl = url;
    this.explicitlyClosed = false;

    this.connectPromise = new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        logger.debug('Already connected.');
        this.connectPromise = null;
        resolve();
        return;
      }

      logger.debug(`[ApiService] Attempting to connect to ${this.serverUrl}...`);
      this.socket = new WebSocket(this.serverUrl);

      const clearPromise = () => {
        this.connectPromise = null;
      };

      this.socket.onopen = () => {
        logger.debug('[ApiService] WebSocket connection established.');
        this._notifyListeners('connection_status', { status: 'connected', url: this.serverUrl });
        clearPromise();
        resolve();
      };

      this.socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        logger.debug('Received message:', message);

        if (message.messageId && this.pendingMessages.has(message.messageId)) {
          const pending = this.pendingMessages.get(message.messageId);
          if (message.payload?.success) {
            pending.resolve(message.payload);
          } else {
            pending.reject(new Error(message.payload?.message || message.payload?.error || 'Tool invocation failed'));
          }
          this.pendingMessages.delete(message.messageId);
        } else {
          // This is a server-pushed message
          this._notifyListeners(message.type, message.payload || message);
        }
      };

      this.socket.onerror = (error) => {
        logger.error('[ApiService] WebSocket error:', error);
        this._notifyListeners('error', error);
        if (this.connectPromise) {
          clearPromise();
          reject(new Error('WebSocket connection error.'));
        }
      };

      this.socket.onclose = (event) => {
        logger.debug(`[ApiService] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        this.pendingMessages.forEach(({ reject: rejectPromise }) => {
          rejectPromise(new Error('WebSocket connection closed before response received.'));
        });
        this.pendingMessages.clear();

        if (this.connectPromise) {
          clearPromise();
          reject(new Error(`WebSocket closed before connection was established. Code: ${event.code}`));
        }

        if (this.explicitlyClosed) {
          this._notifyListeners('connection_status', { status: 'disconnected_explicit' });
        } else {
          this._notifyListeners('connection_status', { status: 'disconnected' });
        }
        this.socket = null;
      };
    });

    return this.connectPromise;
  }

  disconnect() {
    // logger.debug('[ApiService] Explicit disconnect() called.');
    // this.explicitlyClosed = true;
    // if (this.socket) {
    //   this.socket.close();
    // }
    // this.connectPromise = null;
  }

  _notifyListeners(eventType, data) {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error(`Error in listener for ${eventType}:`, error);
      }
    });

    const genericListeners = this.eventListeners.get('*') || [];
    genericListeners.forEach(listener => {
      try {
        listener({ type: eventType, payload: data });
      } catch (error) {
        logger.error(`Error in generic listener for ${eventType}:`, error);
      }
    });
  }

  sendMessage(type, toolNameOrAction, input = {}) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        logger.error('WebSocket is not connected.');
        reject(new Error('WebSocket is not connected.'));
        return;
      }

      const messageId = this.generateMessageId();
      const messagePayload = {
        type: type,
        messageId: messageId,
        payload: {
          tool_name: toolNameOrAction,
          input: input,
        },
      };

      try {
        this.socket.send(JSON.stringify(messagePayload));
        logger.debug('Sent message:', messagePayload);
        this.pendingMessages.set(messageId, { resolve, reject });
      } catch (error) {
        logger.error('Error sending message:', error);
        this.pendingMessages.delete(messageId);
        reject(error);
      }
    });
  }

  invokeTool(toolName, input = {}) {
    return this.sendMessage('tool_invoke', toolName, input);
  }

  addEventListener(eventType, callback) {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, []);
    }
    this.eventListeners.get(eventType).push(callback);
  }

  removeEventListener(eventType, callback) {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  addMessageListener(callback) {
    this.addEventListener('*', callback);
  }

  removeMessageListener(callback) {
    this.removeEventListener('*', callback);
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}

const apiService = new ApiService();
export default apiService;
