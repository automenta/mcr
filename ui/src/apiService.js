// ui/src/apiService.js
import { io } from 'socket.io-client';

const logger = {
  debug: (...args) => console.debug('[ApiService]', ...args),
  error: (...args) => console.error('[ApiService]', ...args),
  warn: (...args) => console.warn('[ApiService]', ...args),
};

// socket.io-client handles reconnection logic by default.
// We can configure it if needed, but defaults are often sufficient.
// const DEFAULT_RECONNECT_INTERVAL = 3000; // ms - socket.io has its own defaults
// const MAX_RECONNECT_ATTEMPTS = 5; // socket.io has its own defaults

class ApiService {
  constructor() {
    this.socket = null;
    this.connectPromise = null;
    // this.disconnectRequested = false; // Less critical with socket.io's disconnect handling
    this.eventListeners = new Map(); // For custom event emitter pattern on top of socket.io
    this.pendingMessages = new Map(); // For tracking request-response
    // this.reconnectAttempts = 0; // Handled by socket.io
    this.explicitlyClosed = false;
    this.serverUrl = null;
    this.correlationId = `ui-corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  connect(url = window.MCR_WEBSOCKET_URL || 'ws://localhost:8081/') {
    // socket.io-client uses http/https URLs for the initial handshake,
    // then upgrades to WebSocket. So, we might need to adjust the ws:// prefix.
    // However, it's often smart enough to handle ws:// too.
    // Let's ensure the URL is appropriate for socket.io.
    // Typically, it's the base URL of the server, e.g., 'http://localhost:8081'
    const socketIOUrl = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');


    if (this.connectPromise) {
      logger.debug('[ApiService] Connection attempt already in progress, returning existing promise.');
      return this.connectPromise;
    }

    this.serverUrl = socketIOUrl; // Store the processed URL
    this.explicitlyClosed = false;

    this.connectPromise = new Promise((resolve, reject) => {
      if (this.socket && this.socket.connected) {
        logger.debug('Already connected via socket.io.');
        this.connectPromise = null;
        resolve();
        return;
      }

      logger.debug(`[ApiService] Attempting to connect to ${this.serverUrl} using socket.io...`);
      // Note: socket.io-client has autoConnect: true by default if not specified.
      // We are explicitly calling connect() here.
      this.socket = io(this.serverUrl, {
        reconnectionAttempts: 5, // Example: configure max reconnection attempts
        // transports: ['websocket'], // Optionally force websockets if polling is an issue
      });

      const clearPromise = () => {
        this.connectPromise = null;
      };

      this.socket.on('connect', () => {
        logger.debug('[ApiService] socket.io: Connection established (event: connect).');
        // this.reconnectAttempts = 0; // Reset by socket.io itself on successful connect
        this._notifyListeners('connection_status', { status: 'connected', url: this.serverUrl });
        clearPromise();
        resolve();
      });

      // Server-side events mapping
      // The server emits 'tool_result', 'kb_updated', 'connection_ack', 'error'
      // No single 'message' event from server for all types.

      this.socket.on('tool_result', (message) => {
        logger.debug('Received tool_result:', message);
        if (message.messageId) {
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
        } else {
            logger.warn('Received tool_result without messageId:', message);
        }
        // Notify generic listeners as well, if any are interested in all tool_results
        this._notifyListeners('tool_result', message.payload || message);
      });

      this.socket.on('kb_updated', (payload) => {
        logger.debug('Received kb_updated:', payload);
        this._notifyListeners('kb_updated', payload);
      });

      this.socket.on('connection_ack', (payload) => {
        logger.debug('Received connection_ack:', payload);
        this._notifyListeners('connection_ack', payload);
      });

      this.socket.on('mcp_event', (payload) => { // Assuming mcpHandler might emit this
        logger.debug('Received mcp_event:', payload);
        this._notifyListeners('mcp_event', payload);
      });

      // Generic error from server (not tied to a specific tool_result)
      this.socket.on('error', (serverErrorPayload) => {
        logger.error('[ApiService] socket.io: Received "error" event from server:', serverErrorPayload);
        this._notifyListeners('error', serverErrorPayload); // Notify listeners for server-originated errors
      });


      this.socket.on('connect_error', (error) => {
        logger.error(`[ApiService] socket.io: Connection error (event: connect_error).`, error);
        // socket.io handles retries, so this is more for notification.
        // The promise should only be rejected if this is the initial connect attempt and it fails definitively.
        // socket.io's own reconnection logic will take over for subsequent attempts.
        if (this.connectPromise) { // Only reject the initial connect promise
            this._notifyListeners('connection_status', { status: 'error', message: 'Socket.IO connection error', error: error.message });
            clearPromise();
            reject(new Error(`Socket.IO connection error: ${error.message}`));
        } else {
            // This means a reconnection attempt failed, notify status but don't reject a non-existent promise.
            this._notifyListeners('connection_status', { status: 'reconnecting_error', message: 'Socket.IO reconnection error', error: error.message });
        }
      });

      this.socket.on('disconnect', (reason) => {
        logger.debug(`[ApiService] socket.io: Connection closed (event: disconnect). Reason: ${reason}`);
        this.pendingMessages.forEach(({ reject: rejectPromise }) => {
          rejectPromise(new Error('Socket.IO connection disconnected before response received.'));
        });
        this.pendingMessages.clear();

        if (this.connectPromise) { // If initial connection promise is still pending and we disconnect
          clearPromise();
          reject(new Error(`Socket.IO disconnected before connection was fully established. Reason: ${reason}`));
        }

        if (reason === 'io server disconnect') {
          // the server explicitly disconnected the socket
          this.explicitlyClosed = true; // Treat as explicit if server initiated
          this._notifyListeners('connection_status', { status: 'disconnected_server', reason });
        } else if (this.explicitlyClosed) {
          // Disconnected because client called socket.disconnect()
          this._notifyListeners('connection_status', { status: 'disconnected_explicit', reason });
        } else {
          // Other reasons (e.g., network issue), socket.io will attempt to reconnect automatically if configured.
          this._notifyListeners('connection_status', { status: 'reconnecting', reason });
        }
      });
    });
    return this.connectPromise;
  }

  disconnect() {
    logger.debug('[ApiService] Explicit disconnect() called for socket.io.');
    this.explicitlyClosed = true;
    if (this.socket) {
      this.socket.disconnect();
    } else {
      logger.debug('[ApiService] disconnect() called, but no socket.io instance.');
    }
  }

  // handleReconnect is largely managed by socket.io-client itself.
  // We can listen to 'reconnect_attempt', 'reconnect_error', 'reconnect_failed', 'reconnect' events if needed.
  // The constructor options for `io()` like `reconnectionAttempts` control this.

  _notifyListeners(eventType, data) {
    const listeners = this.eventListeners.get(eventType) || [];
    listeners.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        logger.error(`Error in listener for ${eventType}:`, error);
      }
    });

    // Also notify generic '*' listeners
    const genericListeners = this.eventListeners.get('*') || [];
    genericListeners.forEach(listener => {
        try {
            listener({ type: eventType, payload: data }); // Wrap it for generic listeners
        } catch (error) {
            logger.error(`Error in generic listener for ${eventType}:`, error);
        }
    });
  }

  // sendMessage needs to be adapted for socket.io's emit
  // The server's `socket.on('message', ...)` in `websocketHandlers.js` is the key.
  // It seems the server expects a single 'message' event with the structured payload.
  sendMessage(type, toolNameOrAction, input = {}) {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        logger.error('Socket.IO is not connected.');
        reject(new Error('Socket.IO is not connected.'));
        return;
      }

      const messageId = this.generateMessageId();
      let messagePayload;

      // The server's websocketHandlers.js -> routeMessage expects a specific structure
      // passed to socket.on('message', (message) => { routeMessage(socket, message); });
      // So we emit 'message' from the client, and the server's routeMessage will parse it.

      if (type === 'mcp') {
        messagePayload = {
          // type: type, // MCP handler might not need 'type' inside, but uses 'action'
          action: toolNameOrAction, // MCP handler uses 'action'
          messageId: messageId,
          payload: input, // MCP payload might not be nested under 'input'
          // clientCorrelationId: this.correlationId // Optional
        };
      } else if (type === 'tool_invoke') {
         messagePayload = {
          type: type,
          messageId: messageId,
          payload: {
            tool_name: toolNameOrAction,
            input: input,
            // clientCorrelationId: this.correlationId // Optional
          },
        };
      } else {
        // Generic message structure if not mcp or tool_invoke
        messagePayload = {
            type: type,
            messageId: messageId,
            action: toolNameOrAction, // Or some other identifier
            payload: input,
            // clientCorrelationId: this.correlationId // Optional
        };
      }

      try {
        // The server (websocketHandlers.js) has socket.on('message', (message) => routeMessage(socket, message));
        // So, the client should emit 'message' as the event name.
        this.socket.emit('message', messagePayload);
        logger.debug('Sent message via socket.io ("message" event):', messagePayload);
        this.pendingMessages.set(messageId, { resolve, reject });
      } catch (error) {
        logger.error('Error sending message via socket.io:', error);
        this.pendingMessages.delete(messageId); // Clean up if send fails immediately
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
    // This will now listen to all specific events and wrap them for the generic listener
    this.addEventListener('*', callback);
  }

  removeMessageListener(callback) {
    this.removeEventListener('*', callback);
  }

  isConnected() {
    return this.socket && this.socket.connected;
  }
}

const apiService = new ApiService();
export default apiService;
