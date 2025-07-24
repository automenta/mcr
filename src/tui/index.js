import Tui from './Tui.js';
import TuiWebSocketManager from './webSocketManager.js';

const wsManager = new TuiWebSocketManager('ws://localhost:8080/ws');
const app = new Tui(wsManager);

app.start();
wsManager.connect();
