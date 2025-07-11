// ui/src/apiService.js
const logger = {
  // Changed console.log to console.debug to comply with no-console rule (if debug is preferred over info)
  // or could disable the rule for this line if .log is specifically desired for this service.
  debug: (...args) => console.debug('[ApiService]', ...args),
  error: (...args) => console.error('[ApiService]', ...args),
  warn: (...args) => console.warn('[ApiService]', ...args),
};

const DEFAULT_RECONNECT_INTERVAL = 3000; // ms
const MAX_RECONNECT_ATTEMPTS = 5;

class ApiService {
  constructor() {
    this.socket = null;
    this.connectPromise = null;
    this.disconnectRequested = false; // Flag to handle StrictMode race condition
    this.eventListeners = new Map();
    this.pendingMessages = new Map();
    this.reconnectInterval = DEFAULT_RECONNECT_INTERVAL;
    this.reconnectAttempts = 0;
    this.explicitlyClosed = false;
    this.serverUrl = null;
    this.correlationId = `ui-corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  // Allow overriding the WebSocket URL via a global variable or use the default.
  // This is useful if the backend server is not on 'ws://localhost:8080/'.
  connect(url = window.MCR_WEBSOCKET_URL || 'ws://localhost:8081/') {
    this.disconnectRequested = false; // Reset flag on new connect attempt

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

      logger.debug(`[ApiService] Attempting to connect to ${url}...`);
      this.socket = new WebSocket(url);
      this.socket._isBeingCleanedUpByStrictMode = false; // Initialize flag on the instance

      const clearPromise = () => {
        this.connectPromise = null;
      };

      this.socket.onopen = () => {
        if (this.disconnectRequested) {
          logger.debug('[ApiService] Connection opened but disconnect was requested. Closing immediately.');
          this.socket.close();
          // The onclose handler will reject the promise.
          return;
        }
        logger.debug('[ApiService] WebSocket.onopen: Connection established.');
        this.reconnectAttempts = 0;
        this._notifyListeners('connection_status', { status: 'connected', url: this.serverUrl });
        clearPromise();
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          logger.debug('Received message:', message);

          if (message.type === 'tool_result' && message.messageId) {
            const pending = this.pendingMessages.get(message.messageId);
            if (pending) {
              if (message.payload?.success) {
                pending.resolve(message.payload);
              } else {
                pending.reject(new Error(message.payload?.message || message.payload?.error || 'Tool invocation failed'));
              }
              this.pendingMessages.delete(message.messageId);
            } else {
              logger.warn('Received tool_result for unknown messageId:', message.messageId);
            }
          } else if (message.type === 'kb_updated' || message.type === 'connection_ack' || message.type === 'error') {
            // For server-pushed messages or generic errors not tied to a specific tool_invoke
            this._notifyListeners(message.type, message.payload || message); // Pass full message if payload isn't nested
          } else {
            // Generic message handling for other types or if type is missing
            // This also covers the '*' listeners added by addMessageListener
            this._notifyListeners('*', message);
            logger.debug('Received generic message:', message);
          }
        } catch (error) {
          logger.error('Error processing received message:', error, event.data);
          this._notifyListeners('service_error', {
            message: 'Failed to process message from server.',
            error: error.message,
            originalData: event.data
          });
        }
      };

      this.socket.onerror = (errorEvent) => {
        const errorMessage = 'WebSocket.onerror triggered.';
        logger.error(`[ApiService] WebSocket.onerror: ${errorMessage}`, errorEvent);
        this._notifyListeners('connection_status', { status: 'error', message: 'WebSocket connection error', event: errorEvent });
        clearPromise();
        reject(new Error('WebSocket connection error during initial connect.'));
      };

      this.socket.onclose = (event) => {
        logger.debug(`[ApiService] WebSocket.onclose: Connection closed. Code: ${event.code}`);
        this.pendingMessages.forEach(({ reject: rejectPromise }) => {
          rejectPromise(new Error('WebSocket connection closed before response received.'));
        });
        this.pendingMessages.clear();

        if (this.connectPromise) {
          clearPromise();
          reject(new Error(`WebSocket closed before connection was established. Code: ${event.code}`));
        }

        const currentSocketInstance = event.target;
        if (!this.explicitlyClosed && !currentSocketInstance._isBeingCleanedUpByStrictMode) {
          this._notifyListeners('connection_status', { status: 'reconnecting', reason: event.reason, code: event.code });
          this.handleReconnect();
        } else {
          // If explicitlyClosed is true OR this specific socket instance was tagged for cleanup,
          // consider it an explicit disconnect and do not attempt to reconnect.
          this._notifyListeners('connection_status', { status: 'disconnected_explicit', reason: event.reason, code: event.code });
        }
      };
    });
    return this.connectPromise;
  }

  disconnect() {
    logger.debug('[ApiService] Explicit disconnect() called.');
    this.disconnectRequested = true;
    this.explicitlyClosed = true;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.socket._isBeingCleanedUpByStrictMode = true; // Tag this instance
      this.socket.close();
    } else {
      logger.debug('[ApiService] disconnect() called, but no socket instance or socket is already closing/closed.');
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      logger.debug(`[ApiService] handleReconnect: Attempting to reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(() => {
        if (this.explicitlyClosed) {
          logger.debug('[ApiService] handleReconnect: WebSocket was explicitly closed during reconnect timeout. Aborting this reconnect attempt.');
          return;
        }
        // The connect() call here will use its own promise, which will be caught by App.jsx if it's the first call,
        // or its error handling (onerror, onclose) will trigger further reconnect logic or max attempts.
        this.connect(this.serverUrl).catch(err => {
            // This catch is for the promise returned by this specific reconnect attempt's connect() call.
            // If this connect() fails, its own .onerror and .onclose will have already been triggered,
            // which would then call handleReconnect again if not explicitly closed.
            logger.warn(`[ApiService] handleReconnect: Reconnect attempt ${this.reconnectAttempts} promise rejected:`, err.message);
        });
      }, this.reconnectInterval);
    } else {
      logger.error('[ApiService] handleReconnect: Max reconnect attempts reached. Will not try again automatically.');
      this._notifyListeners('connection_status', {
        status: 'failed_max_attempts',
        message: `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Will not try again automatically.`,
        attempts: MAX_RECONNECT_ATTEMPTS,
      });
    }
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
  }

  sendMessage(type, toolName, input = {}) {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        logger.error('WebSocket is not connected.');
        reject(new Error('WebSocket is not connected.'));
        return;
      }

      const messageId = this.generateMessageId();
      const message = {
        type: type, // e.g. "tool_invoke"
        messageId: messageId,
        // The server's websocketHandler expects `action` to be the toolName for MCR tools if type is 'tool_invoke'
        // and payload.tool_name to also be set.
        // It also expects headers for correlationId, but we can't set WS headers directly from client JS.
        // The server's websocketHandler assigns a ws.correlationId on connection.
        // We can send our client-generated correlationId in the message if needed, e.g. in payload.headers
        payload: {
          tool_name: toolName,
          input: input,
          // If we want to send client correlationId, we can add it here:
          // clientCorrelationId: this.correlationId
        },
        // The server-side handler also picks up correlationId from ws.correlationId
        // If a specific header format is needed by the server for correlation ID,
        // it should be part of the message payload itself.
        // For now, relying on server-assigned ws.correlationId for logs,
        // and messageId for request-response tracking.
      };

      if (type === 'mcp') { // Special handling for MCP messages if their structure is different
        message.action = toolName; // MCP handler uses 'action'
        message.payload = input; // MCP payload might not be nested under 'input'
      }


      try {
        this.socket.send(JSON.stringify(message));
        logger.debug('Sent message:', message);
        this.pendingMessages.set(messageId, { resolve, reject });
      } catch (error) {
        logger.error('Error sending message:', error);
        reject(error);
      }
    });
  }

  // Specific method for tool invocation
  invokeTool(toolName, input = {}) {
    return this.sendMessage('tool_invoke', toolName, input);
  }

  // Generic event listener
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

  // Kept for backward compatibility if any part of App.jsx specifically uses it.
  // Consider refactoring App.jsx to use addEventListener('*', callback)
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

// Export a singleton instance
const apiService = new ApiService();
export default apiService;
