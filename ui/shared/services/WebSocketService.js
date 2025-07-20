class WebSocketService {
	constructor(url) {
		this.url = url;
		this.socket = null;
		this.messageId = 0;
		this.listeners = new Map();
		this.pendingRequests = new Map();
	}

	connect() {
		return new Promise((resolve, reject) => {
			if (this.socket && this.socket.readyState === WebSocket.OPEN) {
				resolve();
				return;
			}
			this.socket = new WebSocket(this.url);

			const onOpen = () => {
				console.log('WebSocket socket opened, waiting for connection_ack...');
				// At this point, the socket is open, but we wait for the server's ack
			};

			const onMessage = event => {
				const message = JSON.parse(event.data);

				// The first message should be connection_ack
				if (message.type === 'connection_ack') {
					console.log('WebSocket connection acknowledged by server.');
					this.socket.onmessage = handleIncomingMessages; // Switch to normal message handler
					resolve();
					return;
				}

				// If we get something else before ack, it's an error
				reject(new Error('Did not receive connection_ack as first message.'));
				this.socket.close();
			};

			const handleIncomingMessages = event => {
				const message = JSON.parse(event.data);
				if (message.messageId && this.pendingRequests.has(message.messageId)) {
					const { resolve: reqResolve, reject: reqReject } =
						this.pendingRequests.get(message.messageId);
					if (message.payload && message.payload.success === false) {
						this.emit('error', message.payload.error);
						reqReject(message.payload.error);
					} else {
						reqResolve(message);
					}
					this.pendingRequests.delete(message.messageId);
				} else if (this.listeners.has(message.type)) {
					this.listeners
						.get(message.type)
						.forEach(callback => callback(message));
				}
			};

			const onError = error => {
				console.error('WebSocket error:', error);
				reject(error);
			};

			const onClose = () => {
				console.log('WebSocket disconnected');
				this.socket = null;
				// Reject any pending requests
				this.pendingRequests.forEach(({ reject: reqReject }) =>
					reqReject(new Error('WebSocket disconnected.'))
				);
				this.pendingRequests.clear();
				reject(new Error('WebSocket disconnected.'));
			};

			this.socket.onopen = onOpen;
			this.socket.onmessage = onMessage; // Initial handler waits for ack
			this.socket.onerror = onError;
			this.socket.onclose = onClose;
		});
	}

	invoke(tool, args = {}) {
		return new Promise((resolve, reject) => {
			const messageId = `client-msg-${this.messageId++}`;
			const message = {
				type: 'invoke',
				tool,
				args,
				messageId,
			};
			this.socket.send(JSON.stringify(message));
			this.pendingRequests.set(messageId, { resolve, reject });
		});
	}

	emit(type, payload) {
		if (this.listeners.has(type)) {
			this.listeners.get(type).forEach(callback => callback(payload));
		}
	}

	subscribe(type, callback) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, []);
		}
		this.listeners.get(type).push(callback);
	}

	unsubscribe(type, callback) {
		if (this.listeners.has(type)) {
			const newListeners = this.listeners.get(type).filter(l => l !== callback);
			if (newListeners.length === 0) {
				this.listeners.delete(type);
			} else {
				this.listeners.set(type, newListeners);
			}
		}
	}
}

export { WebSocketService };
