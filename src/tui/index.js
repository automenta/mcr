const Tui = require('./Tui.js');
const TuiWebSocketManager = require('./webSocketManager.js');

const wsManager = new TuiWebSocketManager('ws://localhost:8080/ws');
const app = new Tui(wsManager);

app.start();
wsManager.connect();
