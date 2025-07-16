import { v4 as uuidv4 } from 'uuid';

const logger = {
    debug: (...args) => console.debug('[ApiService]', ...args),
    info: (...args) => console.info('[ApiService]', ...args),
    warn: (...args) => console.warn('[ApiService]', ...args),
    error: (...args) => console.error('[ApiService]', ...args),
};

class ApiService {
    constructor() {
        this.socket = null;
        this.connectionPromise = null;
        this.eventListeners = new Map();
        this.pendingMessages = new Map();
        this.sessionId = null;
        this.correlationId = `ui-corr-${uuidv4()}`;

        this.connectAndCreateSession();
    }

    generateMessageId() {
        return `msg-${uuidv4()}`;
    }

    buildWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }

    async connectAndCreateSession() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }
        logger.info('Initiating new connection and session creation.');
        this.connectionPromise = this._connect();

        try {
            await this.connectionPromise;
            logger.info('WebSocket connected, now creating session.');
            const sessionData = await this.invokeTool('session.create', {
                // Add any session creation parameters if needed
            });
            this.sessionId = sessionData.data.id;
            logger.info(`Session created successfully: ${this.sessionId}`);
            this._notifyListeners('session_created', { sessionId: this.sessionId });
        } catch (error) {
            logger.error('Failed to connect or create session:', error);
            this.connectionPromise = null; // Allow for reconnection attempts
            this._notifyListeners('error', { message: 'Failed to establish a session.', error });
        }
        return this.connectionPromise;
    }

    _connect() {
        return new Promise((resolve, reject) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                resolve();
                return;
            }

            const url = this.buildWebSocketUrl();
            logger.info(`Connecting to ${url}`);
            this.socket = new WebSocket(url);

            this.socket.onopen = () => {
                logger.info('WebSocket connection established.');
                this._notifyListeners('connection_status', { status: 'connected', url });
                resolve();
            };

            this.socket.onmessage = this.handleMessage.bind(this);

            this.socket.onerror = (event) => {
                logger.error('WebSocket error:', event);
                this._notifyListeners('error', { message: 'WebSocket error occurred.', event });
                reject(new Error('WebSocket connection error.'));
            };

            this.socket.onclose = (event) => {
                logger.warn(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
                this._notifyListeners('connection_status', { status: 'disconnected', code: event.code, reason: event.reason });
                this.socket = null;
                this.connectionPromise = null; // Allow reconnection
            };
        });
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            logger.debug('Received message:', message);

            if (message.messageId && this.pendingMessages.has(message.messageId)) {
                const { resolve, reject } = this.pendingMessages.get(message.messageId);
                if (message.payload?.success) {
                    resolve(message.payload);
                } else {
                    const errorMessage = message.payload?.message || message.payload?.error || 'Tool invocation failed';
                    reject(new Error(errorMessage));
                }
                this.pendingMessages.delete(message.messageId);
            } else if (message.type === 'connection_ack') {
                this.correlationId = message.correlationId;
                logger.info(`Connection acknowledged by server with correlation ID: ${this.correlationId}`);
            } else {
                this._notifyListeners(message.type, message.payload || message);
            }
        } catch (error) {
            logger.error('Error handling incoming message:', error);
        }
    }

    async ensureConnected() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            logger.info('Not connected. Attempting to reconnect...');
            // This will trigger the connection and session creation logic
            await this.connectAndCreateSession();
        }
        return this.connectionPromise;
    }

    async sendMessage(type, toolNameOrAction, input = {}) {
        await this.ensureConnected();

        return new Promise((resolve, reject) => {
            const messageId = this.generateMessageId();
            const messagePayload = {
                type: type,
                messageId: messageId,
                correlationId: this.correlationId,
                sessionId: this.sessionId,
                payload: {
                    tool_name: toolNameOrAction,
                    input: { ...input, sessionId: this.sessionId },
                },
            };

            try {
                this.socket.send(JSON.stringify(messagePayload));
                logger.debug('Sent message:', messagePayload);
                this.pendingMessages.set(messageId, { resolve, reject, timeout: setTimeout(() => {
                    this.pendingMessages.delete(messageId);
                    reject(new Error(`Message timed out: ${messageId}`));
                }, 30000) }); // 30-second timeout
            } catch (error) {
                logger.error('Error sending message:', error);
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

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    getSessionId() {
        return this.sessionId;
    }
}

const apiService = new ApiService();
export default apiService;
