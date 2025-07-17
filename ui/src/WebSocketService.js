class WebSocketService {
	constructor(url) {
		this.url = url;
		this.socket = null;
		this.messageId = 0;
		this.listeners = new Map();
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
				if (this.listeners.has(message.type)) {
					this.listeners
						.get(message.type)
						.forEach(callback => callback(message));
				}
				if (message.messageId && this.listeners.has(message.messageId)) {
					this.listeners
						.get(message.messageId)
						.forEach(callback => callback(message));
					this.listeners.delete(message.messageId);
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

	sendMessage(tool_name, input, onReply) {
		const messageId = `client-msg-${this.messageId++}`;
		const message = {
			type: 'tool_invoke',
			messageId,
			payload: {
				tool_name,
				input,
			},
		};
		this.socket.send(JSON.stringify(message));

		if (onReply) {
			this.once(messageId, onReply);
		}
	}

	loadOntology(ontology, onReply) {
		this.sendMessage('ontology.load', { ontology }, onReply);
	}

	listStrategies(onReply) {
		this.sendMessage('strategy.list', {}, onReply);
	}

	runEvaluation(onReply) {
		this.sendMessage('evaluation.run', {}, onReply);
	}

	on(type, callback) {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, []);
		}
		this.listeners.get(type).push(callback);
	}

	once(type, callback) {
		const onceCallback = message => {
			callback(message);
			this.off(type, onceCallback);
		};
		this.on(type, onceCallback);
	}

	off(type, callback) {
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

export default new WebSocketService(`ws://${window.location.host}/ws`);
