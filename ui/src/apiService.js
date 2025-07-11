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
    // Store listeners by event type. '*' for all messages.
    // Example: { '*': [listener1, listener2], 'connection_status': [listener3] }
    this.eventListeners = new Map();
    this.pendingMessages = new Map(); // Store { resolve, reject } for messages awaiting response
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
  connect(url = window.MCR_WEBSOCKET_URL || 'ws://localhost:8080/') {
    this.serverUrl = url;
    this.explicitlyClosed = false; // Reset this flag on every explicit call to connect

    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        logger.debug('Already connected.');
        resolve();
        return;
      }

      if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        logger.debug('[ApiService] Connection attempt already in progress.');
        // Could potentially queue this promise to resolve with the ongoing attempt
        reject(new Error('Connection attempt already in progress.'));
        return;
      }

      logger.debug(`[ApiService] Attempting to connect to ${url} (Attempt: ${this.reconnectAttempts + 1})...`);
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        logger.debug('[ApiService] WebSocket.onopen: Connection established.');
        this.reconnectAttempts = 0; // Reset on successful connection
        this._notifyListeners('connection_status', { status: 'connected', url: this.serverUrl });
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          logger.debug('Received message:', message);

          if (message.messageId && this.pendingMessages.has(message.messageId)) {
            const { resolve: resolvePromise, reject: rejectPromise } = this.pendingMessages.get(message.messageId);
            if (message.payload?.success) {
              resolvePromise(message.payload);
            } else {
              rejectPromise(message.payload || new Error('Request failed with no payload'));
            }
            this.pendingMessages.delete(message.messageId);
          }

          // Notify generic message listeners
          this._notifyListeners('*', message);
          // Notify listeners for specific message types if the message has a 'type'
          if (message.type) {
            this._notifyListeners(message.type, message);
          }

        } catch (error) {
          logger.error('Error processing message or invalid JSON:', error, event.data);
        }
      };

       this.socket.onerror = (errorEvent) => { // error is an Event, not an Error object
        const errorMessage = 'WebSocket.onerror triggered.'; // Generic message, details in event object
        logger.error(`[ApiService] WebSocket.onerror: ${errorMessage}`, errorEvent);
        // For initial connect, this error means failure for the current connect() promise.
        // apiService's onclose handler will manage reconnect attempts.
        this._notifyListeners('connection_status', { status: 'error', message: (errorEvent && errorEvent.message) || 'WebSocket connection error', event: errorEvent });
        reject(new Error((errorEvent && errorEvent.message) || 'WebSocket connection error during initial connect.')); // Reject the current connect promise
      };

      this.socket.onclose = (event) => {
        logger.debug(`[ApiService] WebSocket.onclose: Connection closed. WasClean: ${event.wasClean}, Code: ${event.code}, Reason: '${event.reason}'`);
        this.pendingMessages.forEach(({ reject: rejectPromise }) => {
          rejectPromise(new Error('WebSocket connection closed before response received.'));
        });
        this.pendingMessages.clear();

        if (!this.explicitlyClosed) {
          this._notifyListeners('connection_status', { status: 'reconnecting', reason: event.reason, code: event.code });
          this.handleReconnect();
        } else {
          this._notifyListeners('connection_status', { status: 'disconnected_explicit', reason: event.reason, code: event.code });
        }
      };
    });
  }

  disconnect() {
    if (this.socket) {
      logger.debug('[ApiService] Explicit disconnect() called.');
      this.explicitlyClosed = true;
      this.socket.close(); // onclose listener will fire and handle notifications
    } else {
      logger.debug('[ApiService] disconnect() called, but no socket instance.');
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
