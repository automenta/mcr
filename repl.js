const blessed = require('blessed');
const contrib = require('blessed-contrib');
const WebSocket = require('ws');

// Create a screen object.
const screen = blessed.screen({
  smartCSR: true,
  title: 'MCR TUI REPL'
});

const grid = new contrib.grid({rows: 12, cols: 12, screen: screen});

// Header
const header = grid.set(0, 0, 1, 12, blessed.box, {
    content: '{center}MCR TUI REPL{/center}',
    tags: true,
    style: {
        fg: 'blue',
    }
});

// Knowledge Base Tree
const kbTree = grid.set(1, 0, 10, 4, contrib.tree, {
    label: 'Knowledge Base',
    style: {
        fg: 'green',
        text: 'green',
        border: {
            fg: 'green'
        }
    }
});

// Chat/Log Area
const chatLog = grid.set(1, 4, 10, 8, blessed.log, {
    label: 'Chat/Log',
    content: '',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
        ch: ' ',
        track: {
            bg: 'cyan'
        },
        style: {
            inverse: true
        }
    },
    style: {
        fg: 'white',
        border: {
            fg: 'white'
        }
    }
});

// Input Bar
const inputBar = grid.set(11, 0, 1, 12, blessed.textbox, {
    label: 'Input',
    inputOnFocus: true,
    style: {
        fg: 'white',
        bg: 'blue',
        border: {
            fg: 'blue'
        },
        focus: {
            bg: 'red'
        }
    }
});


// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0);
});

// Hotkeys
const components = [inputBar, chatLog, kbTree];
let focusIndex = 0;

screen.key(['C-w'], (ch, key) => {
    focusIndex = (focusIndex + 1) % components.length;
    components[focusIndex].focus();
});

screen.key(['C-l'], (ch, key) => {
    chatLog.setContent('');
    screen.render();
});

// Focus on input bar
inputBar.focus();

// WebSocket connection
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', function open() {
    chatLog.log('Connected to WebSocket server.');
    screen.render();
});

ws.on('message', function incoming(data) {
    const response = JSON.parse(data);
    if (response.type === 'response') {
        const { payload } = response;
        if (payload.success) {
            let content = '';
            if (payload.data && payload.data.answer) {
                content = payload.data.answer;
            } else if (payload.message) {
                content = payload.message;
            } else {
                content = JSON.stringify(payload, null, 2);
            }
            chatLog.log(`{green-fg}System:{/green-fg} ${content}`);
        } else {
            let errorMessage = `Error: ${payload.error}`;
            if (payload.details) {
                errorMessage += ` - ${payload.details}`;
            }
            chatLog.log(`{red-fg}System:{/red-fg} ${errorMessage}`);
        }
    } else if (response.type === 'session') {
        chatLog.log(`Session created: ${response.sessionId}`);
    }

    if (response.payload && response.payload.fullKnowledgeBase) {
        const kb = response.payload.fullKnowledgeBase;
        const treeData = {
            name: 'KB',
            extended: true,
            children: []
        };

        if (kb.facts) {
            treeData.children.push({
                name: 'Facts',
                extended: true,
                children: kb.facts.map(f => ({ name: f }))
            });
        }

        if (kb.rules) {
            treeData.children.push({
                name: 'Rules',
                extended: true,
                children: kb.rules.map(r => ({ name: r }))
            });
        }
        kbTree.setData(treeData);
    }
    screen.render();
});

const history = [];
let historyIndex = 0;

inputBar.on('submit', (text) => {
    if (text) {
        chatLog.log(`{blue-fg}User:{/blue-fg} ${text}`);
        ws.send(JSON.stringify({
            type: 'invoke',
            procedure: 'mcr.handle',
            params: {
                naturalLanguageText: text,
            }
        }));
        history.push(text);
        historyIndex = history.length;
        inputBar.clearValue();
        inputBar.focus();
        screen.render();
    }
});

inputBar.key('up', () => {
    if (historyIndex > 0) {
        historyIndex--;
        inputBar.setValue(history[historyIndex]);
        screen.render();
    }
});

inputBar.key('down', () => {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        inputBar.setValue(history[historyIndex]);
        screen.render();
    } else {
        historyIndex = history.length;
        inputBar.clearValue();
        screen.render();
    }
});

ws.on('close', function close() {
    chatLog.log('Disconnected from WebSocket server.');
    screen.render();
});

ws.on('error', function error(err) {
    chatLog.log(`WebSocket error: ${err.message}`);
    screen.render();
});

// Render the screen.
screen.render();
