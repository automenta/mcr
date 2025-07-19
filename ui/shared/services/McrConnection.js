import { WebSocketService } from './WebSocketService.js';

/**
 * @class McrConnection
 * @description A singleton class to manage the WebSocket connection to the MCR server.
 */
export class McrConnection {
    static instance;

    /**
     * @constructor
     * @description Creates a new McrConnection instance if one doesn't already exist.
     */
    constructor() {
        if (McrConnection.instance) {
            return McrConnection.instance;
        }

        this.ws = new WebSocketService(`ws://${window.location.host}/ws`);
        this.connectionPromise = this.ws.connect().then(async () => {
            const { sessionId } = await this.ws.invoke('createSession');
            this.sessionId = sessionId;
        });

        McrConnection.instance = this;
    }

    /**
     * @method invoke
     * @description Invokes a remote procedure on the MCR server.
     * @param {string} tool - The name of the tool to invoke.
     * @param {object} args - The arguments to pass to the tool.
     * @param {function} loadingSetter - A function to call to set the loading state.
     * @returns {Promise<any>} - A promise that resolves with the result of the invocation.
     */
    async invoke(tool, args, loadingSetter) {
        await this.connectionPromise;
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

    /**
     * @method subscribe
     * @description Subscribes to an event from the MCR server.
     * @param {string} type - The type of event to subscribe to.
     * @param {function} callback - The callback to execute when the event is received.
     */
    subscribe(type, callback) {
        this.ws.subscribe(type, callback);
    }

    /**
     * @method unsubscribe
     * @description Unsubscribes from an event from the MCR server.
     * @param {string} type - The type of event to unsubscribe from.
     * @param {function} callback - The callback to remove from the subscription.
     */
    unsubscribe(type, callback) {
        this.ws.unsubscribe(type, callback);
    }
}
