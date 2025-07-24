const WebSocket = require('ws');

class TuiWebSocketManager {
	constructor(url = 'ws://localhost:8080/ws') {
		this.url = url;
		this.socket = null;
		this.messageId = 0;
		this.pendingRequests = new Map();
		this.reconnectAttempts = 0;
		this.maxReconnectAttempts = 5;
		this.reconnectDelay = 3000;
		this.connected = false;
		this.onConnectCallback = null;
		this.onDisconnectCallback = null;
		this.onMessageCallback = null;
	}

	connect() {
		if (this.socket && 
			(this.socket.readyState === WebSocket.CONNECTING || 
			 this.socket.readyState === WebSocket.OPEN)) {
			return;
		}
		
		this.socket = new WebSocket(this.url);
		
		this.socket.onopen = () => {
			this.connected = true;
			this.reconnectAttempts = 0;
			if (this.onConnectCallback) {
				this.onConnectCallback();
			}
		};
		
		this.socket.onmessage = this.handleMessage.bind(this);
		this.socket.onclose = this.handleClose.bind(this);
		this.socket.onerror = this.handleError.bind(this);
	}

	handleMessage(event) {
		try {
			const message = JSON.parse(event.data);
			
			if (message.messageId && this.pendingRequests.has(message.messageId)) {
				const resolve = this.pendingRequests.get(message.messageId);
				if (resolve) {
					resolve(message);
					this.pendingRequests.delete(message.messageId);
				}
			}
			
			if (this.onMessageCallback) {
				this.onMessageCallback(message);
			}
		} catch (error) {
			console.error('Error processing WebSocket message:', error);
		}
	}

	handleClose() {
		this.connected = false;
		
		if (this.reconnectAttempts < this.maxReconnectAttempts) {
			setTimeout(() => {
				this.reconnectAttempts++;
				this.connect();
			}, this.reconnectDelay);
		} else if (this.onDisconnectCallback) {
			this.onDisconnectCallback();
		}
	}

	handleError(error) {
		console.error('WebSocket error:', error);
	}

	// Event handlers
	onMessage(callback) {
		this.onMessageCallback = callback;
	}

	onConnect(callback) {
		this.onConnectCallback = callback;
	}

	onDisconnect(callback) {
		this.onDisconnectCallback = callback;
	}

	// Send a message to the server
	sendMessage(message) {
		if (!this.connected || this.socket.readyState !== WebSocket.OPEN) {
			return Promise.reject(new Error('WebSocket not connected'));
		}
		
		return new Promise((resolve, reject) => {
			const messageId = `client-msg-${this.messageId++}`;
			message.messageId = messageId;
			
			// Store the resolve function to call when we get a response
			const timeoutId = setTimeout(() => {
				this.pendingRequests.delete(messageId);
				reject(new Error('Request timeout'));
			}, 5000); // 5 second timeout
			
			this.pendingRequests.set(messageId, (response) => {
				clearTimeout(timeoutId);
				resolve(response);
			});
			
			try {
				this.socket.send(JSON.stringify(message));
			} catch (error) {
				reject(error);
			}
		});
	}
	
	// Convenience method for invoking tools
	invoke(tool, args = {}) {
		return this.sendMessage({
			type: 'invoke',
			tool,
			args
		});
	}
}

module.exports = TuiWebSocketManager;
