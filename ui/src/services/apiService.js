// ui/src/services/apiService.js

const DEFAULT_WS_URL = `ws://${window.location.hostname}:8080/ws`; // Assuming backend on port 8080

class ApiService {
  constructor() {
    this.ws = null;
    this.messageListeners = new Map(); // eventName -> Set<callback>
    this.toolResultListeners = new Map(); // correlationId -> callback
    this.pendingMessages = []; // Queue for messages if sent before connection is open
    this.retryTimeout = 5000; // Time in ms to wait before retrying connection
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  _emit(eventName, data) {
    if (this.messageListeners.has(eventName)) {
      this.messageListeners.get(eventName).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error in listener for ${eventName}:`, e);
        }
      });
    }
  }

  connect(url = DEFAULT_WS_URL) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[ApiService] WebSocket already connected or connecting.');
      return;
    }

    console.log(`[ApiService] Attempting to connect to ${url}...`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[ApiService] WebSocket connection established.');
      this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      this._emit('open');
      // Send any pending messages
      this.pendingMessages.forEach(msg => this.ws.send(msg));
      this.pendingMessages = [];
    };

    this.ws.onmessage = (event) => {
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(event.data);
      } catch (error) {
        console.error('[ApiService] Error parsing message from server:', event.data, error);
        this._emit('error', { type: 'parse_error', message: 'Invalid JSON from server' });
        return;
      }

      console.log('[ApiService] Received message:', parsedMessage);
      this._emit('message', parsedMessage); // General message listener

      if (parsedMessage.type === 'tool_result' && parsedMessage.correlationId) {
        if (this.toolResultListeners.has(parsedMessage.correlationId)) {
          const callback = this.toolResultListeners.get(parsedMessage.correlationId);
          callback(parsedMessage.payload); // Pass only the payload
          this.toolResultListeners.delete(parsedMessage.correlationId); // One-time listener
        } else {
          // Emit as a general tool_result if no specific listener
          this._emit(`tool_result`, parsedMessage);
        }
      } else if (parsedMessage.type === 'kb_updated') {
        this._emit('kb_updated', parsedMessage.payload);
      } else if (parsedMessage.type === 'connection_ack') {
        this._emit('connection_ack', parsedMessage);
      } else if (parsedMessage.type === 'error') {
        console.error('[ApiService] Received server error message:', parsedMessage.payload);
        this._emit('server_error', parsedMessage.payload);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[ApiService] WebSocket error:', error);
      this._emit('error', error);
      // No automatic reconnect logic here, let onclose handle it
    };

    this.ws.onclose = (event) => {
      console.log('[ApiService] WebSocket connection closed.', event.code, event.reason);
      this._emit('close', { code: event.code, reason: event.reason, wasClean: event.wasClean });
      this.ws = null; // Clear the instance

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        console.log(`[ApiService] Attempting to reconnect in ${this.retryTimeout / 1000}s... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        setTimeout(() => this.connect(url), this.retryTimeout);
      } else {
        console.error(`[ApiService] Max reconnect attempts reached for ${url}.`);
      }
    };
  }

  disconnect() {
    if (this.ws) {
      console.log('[ApiService] Disconnecting WebSocket.');
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection after explicit disconnect
  }

  /**
   * Sends a message to the WebSocket server.
   * @param {string} type - The message type (e.g., 'tool_invoke').
   * @param {string} toolName - The name of the tool to invoke.
   * @param {object} input - The input payload for the tool.
   * @param {string} correlationId - A unique ID to correlate requests and responses.
   * @returns {Promise<object>} A promise that resolves with the tool's result payload if a correlationId is provided.
   *                            If no correlationId, returns a promise that resolves once message is sent (if connected) or queued.
   */
  send(type, toolName, input, correlationId) {
    const message = {
      type: type,
      correlationId: correlationId || `client-generated-${Date.now()}-${Math.random().toString(36).substring(2,7)}`, // Generate one if not provided
      payload: {
        tool_name: toolName,
        input: input,
      }
    };
    const messageString = JSON.stringify(message);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(messageString);
    } else {
      console.warn('[ApiService] WebSocket not open. Queuing message.');
      this.pendingMessages.push(messageString);
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
         // Attempt to connect if closed
        console.log('[ApiService] WebSocket is closed, attempting to reconnect before sending.')
        this.connect(); // Use default URL
      }
    }

    // Return a promise that resolves with the specific tool_result
    if (correlationId && type === 'tool_invoke') {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.toolResultListeners.delete(correlationId);
          reject(new Error(`Timeout waiting for tool_result for correlationId: ${correlationId}`));
        }, 30000); // 30-second timeout

        this.toolResultListeners.set(correlationId, (resultPayload) => {
          clearTimeout(timeout);
          if (resultPayload.success) {
            resolve(resultPayload);
          } else {
            // Construct a more informative error
            const error = new Error(resultPayload.message || 'Tool execution failed on server.');
            error.details = resultPayload.details;
            error.errorCode = resultPayload.error;
            error.correlationId = correlationId;
            reject(error);
          }
        });
      });
    }
    return Promise.resolve(); // If no correlationId, promise resolves when message is queued/sent.
  }

  /**
   * Registers a callback for a specific event.
   * @param {string} eventName - e.g., 'open', 'close', 'error', 'message', 'kb_updated', 'server_error', 'connection_ack'.
   * @param {function} callback - The function to call when the event occurs.
   * @returns {function} A function to unregister the listener.
   */
  on(eventName, callback) {
    if (!this.messageListeners.has(eventName)) {
      this.messageListeners.set(eventName, new Set());
    }
    this.messageListeners.get(eventName).add(callback);

    return () => {
      if (this.messageListeners.has(eventName)) {
        this.messageListeners.get(eventName).delete(callback);
        if (this.messageListeners.get(eventName).size === 0) {
          this.messageListeners.delete(eventName);
        }
      }
    };
  }

  /**
   * A specific listener for tool results that doesn't rely on pre-registering a correlationId.
   * This is useful if the component handling the result is different from the one sending.
   * Typically, the Promise-based `send` method is preferred for request-response.
   * @param {function} callback - Called with the full tool_result message object.
   * @returns {function} A function to unregister the listener.
   */
  onToolResult(callback) {
    return this.on('tool_result', callback);
  }

  /**
   * A specific listener for kb_updated events.
   * @param {function} callback - Called with the payload of the kb_updated message.
   * @returns {function} A function to unregister the listener.
   */
  onKbUpdate(callback) {
    return this.on('kb_updated', callback);
  }
}

// Export a singleton instance
const apiServiceInstance = new ApiService();
export default apiServiceInstance;
