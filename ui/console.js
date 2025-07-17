const WebSocket = require('ws');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', function open() {
  console.log('Connected to server.');
  rl.prompt();
});

ws.on('message', function incoming(data) {
  const message = JSON.parse(data);
  console.log('Received:', message);
  rl.prompt();
});

ws.on('close', function close() {
  console.log('Disconnected from server.');
  process.exit(0);
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
  process.exit(1);
});

rl.on('line', (line) => {
  const message = {
    type: 'tool_invoke',
    messageId: `console-msg-${Date.now()}`,
    payload: {
      tool_name: 'mcr.handle',
      input: {
        naturalLanguageText: line.trim(),
      },
    },
  };
  ws.send(JSON.stringify(message));
  rl.prompt();
});

rl.on('close', () => {
  ws.close();
});
