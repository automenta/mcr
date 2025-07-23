const blessed = require('blessed');
const contrib = require('blessed-contrib');
const WebSocket = require('ws');
const Header = require('./header');
const KbTree = require('./kbTree');
const ChatLog = require('./chatLog');
const InputBar = require('./inputBar');
const Help = require('./help');
const StatusBar = require('./statusBar');

class App {
    constructor() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'MCR TUI REPL'
        });

        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        this.header = new Header(this.grid);
        this.kbTree = new KbTree(this.grid);
        this.chatLog = new ChatLog(this.grid);
        this.inputBar = new InputBar(this.grid);
        this.help = new Help(this.screen);
        this.statusBar = new StatusBar(this.grid);

        this.screen.on('resize', () => {
            this.header.element.emit('attach');
            this.kbTree.element.emit('attach');
            this.kbTree.searchBar.emit('attach');
            this.chatLog.element.emit('attach');
            this.inputBar.element.emit('attach');
            this.statusBar.element.emit('attach');
            this.screen.render();
        });

        this.ws = null;

        this.loadingSpinner = blessed.loading({
            top: 'center',
            left: 'center',
            width: 20,
            height: 5,
            border: 'line',
            tags: true,
            content: 'Loading...'
        });
        this.screen.append(this.loadingSpinner);
        this.loadingSpinner.hide();

        this.setupHotkeys();
        this.setupWebSocket();
    }

    setupHotkeys() {
        this.screen.key(['escape', 'q', 'C-c'], () => process.exit(0));

        const components = [this.inputBar.element, this.chatLog.element, this.kbTree.element, this.kbTree.searchBar];
        let focusIndex = 0;

        this.screen.key(['C-w'], () => {
            focusIndex = (focusIndex + 1) % components.length;
            components[focusIndex].focus();
        });

        this.screen.key(['C-l'], () => {
            this.chatLog.clear();
            this.screen.render();
        });

        this.screen.key(['C-y'], () => {
            this.chatLog.copy();
        });

        this.screen.key(['?'], () => this.help.toggle());
    }

    setupWebSocket() {
        this.ws = new WebSocket('ws://localhost:3000/ws');

        this.ws.on('open', () => {
            this.chatLog.log('🚀 Connected to WebSocket server.');
            this.statusBar.updateStatus('{green-fg}Connected{/green-fg}');
            this.screen.render();
        });

        this.ws.on('message', (data) => {
            const response = JSON.parse(data);
            this.handleWebSocketMessage(response);
        });

        this.ws.on('close', () => {
            this.chatLog.log('🔌 Disconnected from WebSocket server.');
            this.statusBar.updateStatus('{red-fg}Disconnected{/red-fg}');
            this.screen.render();
        });

        this.ws.on('error', (err) => {
            this.chatLog.log(`🔥 WebSocket error: ${err.message}`);
            this.statusBar.updateStatus('{red-fg}Error{/red-fg}');
            this.screen.render();
        });
    }

    handleWebSocketMessage(response) {
        this.loadingSpinner.stop();
        this.loadingSpinner.hide();

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
                this.chatLog.log(`✅ {green-fg}System:{/green-fg} ${content}`);
            } else {
                let errorMessage = `❌ Error: ${payload.error}`;
                if (payload.details) {
                    errorMessage += ` - ${payload.details}`;
                }
                this.chatLog.log(`🔥 {red-fg}System:{/red-fg} ${errorMessage}`);
            }
        } else if (response.type === 'session') {
            this.chatLog.log(`✨ Session created: ${response.sessionId}`);
        }

        if (response.payload && response.payload.fullKnowledgeBase) {
            this.kbTree.setData(response.payload.fullKnowledgeBase);
        }
        this.screen.render();
    }

    start() {
        this.inputBar.element.focus();
        this.inputBar.onSubmit((text) => {
            if (text.startsWith('/')) {
                this.handleCommand(text);
            } else if (text) {
                this.chatLog.log(`💬 {blue-fg}User:{/blue-fg} ${text}`);
                this.loadingSpinner.load('Thinking...');
                this.ws.send(JSON.stringify({
                    type: 'invoke',
                    tool: 'mcr.handle',
                    args: {
                        naturalLanguageText: text,
                    }
                }));
            }
        });
        this.screen.render();
    }

    handleCommand(text) {
        const [command, ...args] = text.slice(1).split(' ');
        switch (command) {
            case 'exit':
                process.exit(0);
                break;
            case 'clear':
                this.chatLog.clear();
                break;
            case 'clear-kb':
                this.ws.send(JSON.stringify({
                    type: 'invoke',
                    tool: 'kb.clear',
                    args: {}
                }));
                this.chatLog.log('🧠 Knowledge base cleared.');
                break;
            case 'help':
                this.help.toggle();
                break;
            default:
                this.chatLog.log(`🔥 Unknown command: ${command}`);
        }
    }
}

module.exports = App;
