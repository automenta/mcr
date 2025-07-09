// ui/src/apiService.js
const SERVER_URL = `ws://${window.location.host}`; // Assuming WS server is on the same host

class ApiClient {
  constructor() {
    this.socket = null;
    this.messageListeners = new Map(); // For specific correlationId responses
    this.eventListeners = { // For broadcasted events
      onConnectionAck: null,
      onKbUpdate: null,
      onToolResult: null, // For generic tool results (e.g. errors not tied to a specific call promise)
      onError: null,       // For WebSocket level errors
      onDisconnect: null,
    };
    this.pendingToolDefinitions = null; // Promise for initial tool definitions
    this.availableTools = {}; // Store definitions: { toolName: { description: "..."} }
    this.clientId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000; // 3 seconds
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
        console.log('[APIClient] Already connected or connecting.');
        return;
    }

    console.log(`[APIClient] Connecting to ${SERVER_URL}...`);
    this.socket = new WebSocket(SERVER_URL);

    this.pendingToolDefinitions = new Promise((resolve, reject) => {
        this.resolveToolDefinitions = resolve;
        this.rejectToolDefinitions = reject;
    });


    this.socket.onopen = () => {
      console.log('[APIClient] WebSocket connection established.');
      this.reconnectAttempts = 0; // Reset on successful connection
      // The server will send a 'connection_ack' with tool definitions
    };

    this.socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.debug('[APIClient] Received message:', message);

        if (message.type === 'connection_ack') {
          this.clientId = message.payload.clientId;
          this.availableTools = {};
          message.payload.availableTools.forEach(tool => {
            this.availableTools[tool.name] = { description: tool.description };
          });
          this.resolveToolDefinitions(this.availableTools);
          if (this.eventListeners.onConnectionAck) {
            this.eventListeners.onConnectionAck(message.payload);
          }
          this._generateSdkMethods(); // Generate SDK methods once tools are known
        } else if (message.type === 'kb_updated') {
          if (this.eventListeners.onKbUpdate) {
            this.eventListeners.onKbUpdate(message.payload);
          }
        } else if (message.type === 'tool_result') {
          const callback = this.messageListeners.get(message.correlationId);
          if (callback) {
            callback(message.payload);
            this.messageListeners.delete(message.correlationId);
          } else if (this.eventListeners.onToolResult) {
            // For tool results not handled by a specific promise (e.g. background errors)
            this.eventListeners.onToolResult(message);
          }
        } else if (message.type === 'session_deleted_event') {
            // Could have a specific handler or use a generic event handler
            if (this.eventListeners.onSessionDeleted) { // Example of a specific event
                this.eventListeners.onSessionDeleted(message.payload);
            } else {
                console.log("[APIClient] Received session_deleted_event", message.payload);
            }
        } else if (message.type === 'error') { // Server-sent errors not tied to a tool_result
            if (this.eventListeners.onError) {
                this.eventListeners.onError(message.payload);
            } else {
                console.error('[APIClient] Received server error:', message.payload);
            }
        }
      } catch (e) {
        console.error('[APIClient] Error processing message:', e, event.data);
        if (this.eventListeners.onError) {
            this.eventListeners.onError({ message: "Error processing server message: " + e.message});
        }
      }
    };

    this.socket.onerror = (error) => {
      console.error('[APIClient] WebSocket error:', error);
      if (this.rejectToolDefinitions) this.rejectToolDefinitions(error); // Reject pending tools if connection fails
      if (this.eventListeners.onError) {
        this.eventListeners.onError(error);
      }
      // No automatic reconnect here, let onclose handle it to avoid double handling
    };

    this.socket.onclose = (event) => {
      console.warn(`[APIClient] WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
      this.socket = null; // Clear the socket instance
      if (this.eventListeners.onDisconnect) {
        this.eventListeners.onDisconnect();
      }
      // Attempt to reconnect if not a clean close (e.g., server unavailable)
      if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) { // 1000 is normal closure
        this.reconnectAttempts++;
        console.log(`[APIClient] Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        setTimeout(() => this.connect(), this.reconnectInterval);
      } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[APIClient] Max reconnect attempts reached.');
        if (this.eventListeners.onError) {
            this.eventListeners.onError({ message: "Max reconnect attempts reached. Please check server or refresh."});
        }
      }
    };
  }

  disconnect() {
    if (this.socket) {
      console.log('[APIClient] Disconnecting WebSocket.');
      this.socket.close(1000, "Client initiated disconnect"); // Normal closure
    }
  }

  // Setter methods for event listeners
  setOnConnectionAck(callback) { this.eventListeners.onConnectionAck = callback; }
  setOnKbUpdate(callback) { this.eventListeners.onKbUpdate = callback; }
  setOnToolResult(callback) { this.eventListeners.onToolResult = callback; }
  setOnError(callback) { this.eventListeners.onError = callback; }
  setOnDisconnect(callback) { this.eventListeners.onDisconnect = callback; }
  setOnSessionDeleted(callback) { this.eventListeners.onSessionDeleted = callback; }


  _generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.error('[APIClient] WebSocket is not connected.');
      // Optionally, queue the message or reject a promise
      return Promise.reject(new Error('WebSocket not connected'));
    }
    this.socket.send(JSON.stringify(message));
    return Promise.resolve();
  }

  // Dynamically creates SDK methods based on tool definitions
  _generateSdkMethods() {
    if (!this.availableTools) return;

    Object.keys(this.availableTools).forEach(toolName => {
      this[toolName] = (input) => {
        return new Promise((resolve, reject) => {
          if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.error('[APIClient] WebSocket is not connected.');
            return reject(new Error('WebSocket not connected'));
          }

          const correlationId = this._generateUUID();
          const message = {
            type: 'tool_invoke',
            correlationId,
            payload: {
              tool_name: toolName,
              input: input,
            }
          };

          this.messageListeners.set(correlationId, (responsePayload) => {
            if (responsePayload.success) {
              resolve(responsePayload);
            } else {
              console.error(`[APIClient] Tool '${toolName}' execution failed:`, responsePayload.error);
              reject(responsePayload.error || new Error(`Tool '${toolName}' failed.`));
            }
          });

          console.debug(`[APIClient] Sending tool_invoke for ${toolName}:`, message);
          this.socket.send(JSON.stringify(message));

          // Timeout for tool invocation
          setTimeout(() => {
            if (this.messageListeners.has(correlationId)) {
              this.messageListeners.delete(correlationId);
              reject(new Error(`Tool '${toolName}' invocation timed out.`));
            }
          }, 30000); // 30 second timeout
        });
      };
    });
    console.log('[APIClient] SDK methods generated for tools:', Object.keys(this.availableTools));
  }

  // Expose a way to get tool definitions once available
  async getToolDefinitions() {
    if (Object.keys(this.availableTools).length > 0) return Promise.resolve(this.availableTools);
    return this.pendingToolDefinitions;
  }
}

export const apiClient = new ApiClient();
