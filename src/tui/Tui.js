const blessed = require('blessed');
const contrib = require('blessed-contrib');
const Header = require('./header.js');
const KbTree = require('./kbTree.js');
const ChatLog = require('./chatLog.js');
const InputBar = require('./inputBar.js');
const Help = require('./help.js');
const StatusBar = require('./statusBar.js');

class Tui {
    constructor(wsManager) {
        this.wsManager = wsManager;
        
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'MCR TUI REPL',
            cursor: {
                artificial: true,
                shape: 'line',
                blink: true,
                color: 'white'
            }
        });

        this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

        this.header = new Header(this.grid);
        this.kbTree = new KbTree(this.grid);
        this.chatLog = new ChatLog(this.grid);
        this.inputBar = new InputBar(this.grid);
        this.help = new Help(this.screen);
        this.statusBar = new StatusBar(this.grid);

        this.focusOrder = [
            this.inputBar,
            this.chatLog,
            this.kbTree
        ];
        
        this.currentFocus = 0;

        this.setupHotkeys();
        this.setupEventHandlers();
    }

    start() {
        this.focusOrder[this.currentFocus].focus();
        this.screen.render();
    }

    setupHotkeys() {
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.wsManager.close();
            process.exit(0);
        });
        this.screen.key(['C-w'], this.focusNext.bind(this));
        this.screen.key(['?'], this.help.toggle.bind(this.help));
    }

    focusNext() {
        this.currentFocus = (this.currentFocus + 1) % this.focusOrder.length;
        this.focusOrder[this.currentFocus].focus();
    }

    setupEventHandlers() {
        this.wsManager.onConnect(() => {
            this.logSystemMessage('🚀 Connected to MCR server');
            this.statusBar.updateStatus('{green-fg}Connected{/green-fg}');
            this.wsManager.invoke('session.get', {});
        });

        this.wsManager.onDisconnect(() => {
            this.logSystemMessage('🔌 Disconnected from MCR server');
            this.statusBar.updateStatus('{red-fg}Disconnected{/red-fg}');
        });

        this.wsManager.onMessage((message) => {
            this.handleWebSocketMessage(message);
        });

        this.inputBar.onSubmit(text => {
            this.handleUserInput(text);
        });
    }

    handleWebSocketMessage(message) {
        try {
            if (typeof message === 'string') {
                message = JSON.parse(message);
            }
            
            switch (message.type) {
                case 'result':
                case 'tool_result':
                    this.handleMcrResult(message.payload);
                    break;
                case 'error':
                    this.handleMcrError(message.payload);
                    break;
                case 'connection_ack':
                    this.logSystemMessage('Connection acknowledged by server.');
                    break;
                default:
                    this.logSystemMessage(`Unhandled message type: ${message.type}`);
            }
        } catch (error) {
            this.logSystemMessage(`Error parsing message: ${error.message}`);
        }
        this.screen.render();
    }

    handleMcrResult(payload) {
        if (payload.success) {
            let content = '';
            if (payload.data?.answer) {
                content = blessed.escape(payload.data.answer);
            } else if (payload.message) {
                content = blessed.escape(payload.message);
            } else {
                content = blessed.escape(JSON.stringify(payload.data, null, 2));
            }
            this.chatLog.log(`✅ {green-fg}System:{/green-fg} ${content}`);
        } else {
            let errorMessage = `❌ Error: ${blessed.escape(payload.error || 'Unknown error')}`;
            if (payload.details) {
                errorMessage += ` - ${blessed.escape(JSON.stringify(payload.details))}`;
            }
            this.chatLog.log(`🔥 {red-fg}System:{/red-fg} ${errorMessage}`);
        }

        if (payload.fullKnowledgeBase) {
            this.kbTree.setData(payload.fullKnowledgeBase);
        }
        
        this.screen.render();
    }

    handleUserInput(text) {
        if (text.startsWith('/')) {
            this.handleCommand(text);
            return;
        }
        
        if (!text.trim()) {
            return;
        }
        
        this.chatLog.log(`{cyan-fg}You:{/cyan-fg} ${text}`);
        
        this.wsManager.invoke('mcr.handle', { naturalLanguageText: text })
            .catch(error => {
                this.chatLog.log(`{red-fg}Error sending message: ${error.message}{/red-fg}`);
            });
    }

    handleCommand(text) {
        const [command, ...args] = text.slice(1).split(' ');
        switch (command) {
            case 'exit':
                this.wsManager.close();
                process.exit(0);
                break;
            case 'clear':
                this.chatLog.clear();
                break;
            case 'clear-kb':
                this.wsManager.invoke('session.set_kb', { content: '' })
                    .catch(error => {
                        this.chatLog.log(`{red-fg}Failed to clear KB: ${error.message}{/red-fg}`);
                    });
                this.chatLog.log('🧠 Knowledge base cleared.');
                break;
            case 'help':
                this.help.toggle();
                break;
            default:
                this.chatLog.log(`🔥 Unknown command: ${command}`);
        }
    }

    handleMcrError(error) {
        this.chatLog.log(`🔥 WebSocket error: ${error.message}`);
    }

    logSystemMessage(message) {
        this.chatLog.log(`{gray-fg}[System] ${message}{/gray-fg}`);
    }
}

module.exports = Tui;
