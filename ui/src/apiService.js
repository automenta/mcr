// ui/src/apiService.js
const logger = {
  log: (...args) => console.log('[ApiService]', ...args),
  error: (...args) => console.error('[ApiService]', ...args),
  warn: (...args) => console.warn('[ApiService]', ...args),
};

const DEFAULT_RECONNECT_INTERVAL = 3000; // ms
const MAX_RECONNECT_ATTEMPTS = 5;

class ApiService {
  constructor() {
    this.socket = null;
    this.messageListeners = new Set();
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
        logger.log('Already connected.');
        resolve();
        return;
      }

      if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
        logger.log('Connection attempt already in progress.');
        // Could potentially queue this promise to resolve with the ongoing attempt
        reject(new Error('Connection attempt already in progress.'));
        return;
      }

      logger.log(`Attempting to connect to ${url}...`);
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        logger.log('WebSocket connection established.');
        this.reconnectAttempts = 0; // Reset on successful connection
        // Notify listeners about the connection_ack or other initial messages
        // The server sends a connection_ack, which will be handled by onmessage
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          logger.log('Received message:', message);

          if (message.messageId && this.pendingMessages.has(message.messageId)) {
            const { resolve: resolvePromise, reject: rejectPromise } = this.pendingMessages.get(message.messageId);
            if (message.payload?.success) {
              resolvePromise(message.payload);
            } else {
              rejectPromise(message.payload || new Error('Request failed with no payload'));
            }
            this.pendingMessages.delete(message.messageId);
          }

          this.messageListeners.forEach(listener => listener(message));
        } catch (error) {
          logger.error('Error processing message or invalid JSON:', error, event.data);
        }
      };

      this.socket.onerror = (error) => {
        logger.error('WebSocket error:', error);
        // Don't automatically try to reconnect here, onclose will handle it.
        reject(error); // Reject the initial connect promise
      };

      this.socket.onclose = (event) => {
        logger.log(`WebSocket connection closed. WasClean: ${event.wasClean}, Code: ${event.code}, Reason: '${event.reason}'`);
        this.pendingMessages.forEach(({ reject: rejectPromise }) => {
          rejectPromise(new Error('WebSocket connection closed before response received.'));
        });
        this.pendingMessages.clear();

        if (!this.explicitlyClosed) {
          this.handleReconnect();
        }
      };
    });
  }

  disconnect() {
    if (this.socket) {
      logger.log('Disconnecting WebSocket.');
      this.explicitlyClosed = true;
      this.socket.close();
    }
  }

  handleReconnect() {
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.reconnectAttempts++;
      logger.log(`Attempting to reconnect (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
      setTimeout(() => {
        if (this.explicitlyClosed) {
          logger.log('WebSocket was explicitly closed during reconnect timeout. Aborting this reconnect attempt.');
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
    }
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
        logger.log('Sent message:', message);
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

  // Subscribe to all messages
  addMessageListener(callback) {
    this.messageListeners.add(callback);
  }

  // Unsubscribe
  removeMessageListener(callback) {
    this.messageListeners.delete(callback);
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }
}

// Export a singleton instance
const apiService = new ApiService();
export default apiService;
