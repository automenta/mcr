import WebSocketManager from './WebSocketService.js';

class McrConnection {
    constructor() {
        this.ws = WebSocketManager;
    }

    async connect() {
        await this.ws.connect();
        const { sessionId } = await this.ws.invoke('createSession');
        this.sessionId = sessionId;
        return this;
    }

    async invoke(tool, args, loadingSetter) {
        if (loadingSetter) {
            loadingSetter(true);
        }
        try {
            const response = await this.ws.invoke(tool, args);
            if (response.payload.success) {
                return response.payload.data;
            } else {
                throw new Error(response.payload.error);
            }
        } finally {
            if (loadingSetter) {
                loadingSetter(false);
            }
        }
    }

    subscribe(type, callback) {
        this.ws.subscribe(type, callback);
    }

    unsubscribe(type, callback) {
        this.ws.unsubscribe(type, callback);
    }
}

export default McrConnection;
