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

  connect(url = 'ws://localhost:8080/ws') { // Default MCR server URL
    this.serverUrl = url;
    this.explicitlyClosed = false; // Reset this flag on every explicit call to connect

    return new Promise((resolve, reject) => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        logger.debug('Already connected.');
        resolve();
        return;
      }

      if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        logger.debug('Connection attempt already in progress.');
        // Could potentially queue this promise to resolve with the ongoing attempt
        reject(new Error('Connection attempt already in progress.'));
        return;
      }

      logger.debug(`Attempting to connect to ${url}...`);
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        logger.debug('WebSocket connection established.');
        this.reconnectAttempts = 0; // Reset on successful connection
        this._notifyListeners('connection_status', { status: 'connected', url: this.serverUrl });
        // The server might send a connection_ack, which will be handled by onmessage
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
        const errorMessage = errorEvent.message || 'WebSocket connection error during initial connect.';
        logger.error('WebSocket error:', errorMessage, errorEvent);
        // Don't automatically try to reconnect here, onclose will handle it for retries.
        // For initial connect, this error means failure.
        this._notifyListeners('connection_status', { status: 'error', message: errorMessage, event: errorEvent });
        reject(new Error(errorMessage)); // Reject the initial connect promise with an Error object
      };

      this.socket.onclose = (event) => {
        logger.debug(`WebSocket connection closed. WasClean: ${event.wasClean}, Code: ${event.code}, Reason: '${event.reason}'`);
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
      logger.debug('Disconnecting WebSocket.');
      this.explicitlyClosed = true;
      // Note: onclose listener will fire after this, and then notify 'disconnected_explicit'
      this.socket.close();
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      logger.debug(`Attempting to reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(() => {
        if (this.explicitlyClosed) {
          logger.debug('WebSocket was explicitly closed during reconnect timeout. Aborting this reconnect attempt.');
          return;
        }
        this.connect(this.serverUrl).catch(err => {
            logger.warn(`Reconnect attempt ${this.reconnectAttempts} failed:`, err.message);
            // If connect itself fails (e.g. server definitively down), onclose will trigger handleReconnect again,
            // which will then increment reconnectAttempts and potentially hit the max.
        });
      }, this.reconnectInterval);
    } else {
      logger.error('Max reconnect attempts reached. Will not try again automatically.');
      // At this point, App.jsx's wsConnectionStatus will show the error from the last failed connect attempt.
      // If a more specific "Max attempts reached" message is desired in App.jsx,
      // apiService would need a way to communicate this state back (e.g., event, or a specific error type).
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
