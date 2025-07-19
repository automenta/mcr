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

			this.socket.onopen = () => {
				console.log('WebSocket connected');
				resolve();
			};

			this.socket.onmessage = event => {
				const message = JSON.parse(event.data);
				if (message.messageId && this.pendingRequests.has(message.messageId)) {
					const { resolve, reject } = this.pendingRequests.get(message.messageId);
					if (message.payload && message.payload.success === false) {
						this.emit('error', message.payload.error);
						reject(message.payload.error);
					} else {
						resolve(message);
					}
					this.pendingRequests.delete(message.messageId);
				} else if (this.listeners.has(message.type)) {
					this.listeners
						.get(message.type)
						.forEach(callback => callback(message));
				}
			};

			this.socket.onerror = error => {
				console.error('WebSocket error:', error);
				reject(error);
			};

			this.socket.onclose = () => {
				console.log('WebSocket disconnected');
				this.socket = null;
			};
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

const WebSocketManager = new WebSocketService(`ws://${window.location.host}/ws`);
export default WebSocketManager;
