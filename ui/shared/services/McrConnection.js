import { WebSocketService } from './WebSocketService.js';

class McrConnection {
	constructor() {
		this.ws = new WebSocketService(`ws://${window.location.host}/ws`);
		this.connectionPromise = this.ws.connect().then(async () => {
			const { sessionId } = await this.ws.invoke('createSession');
			this.sessionId = sessionId;
		});
	}

	async invoke(tool, args, loadingSetter) {
		await this.connectionPromise;
		if (loadingSetter) loadingSetter(true);
		try {
			const response = await this.ws.invoke(tool, args);
			if (response.success) {
				return response;
			}
			throw new Error(response.error);
		} finally {
			if (loadingSetter) loadingSetter(false);
		}
	}

	subscribe(type, callback) {
		this.ws.subscribe(type, callback);
	}

	unsubscribe(type, callback) {
		this.ws.unsubscribe(type, callback);
	}
}

export const mcrConnection = new McrConnection();
