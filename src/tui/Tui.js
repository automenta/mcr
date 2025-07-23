
import blessed from 'blessed';
import contrib from 'blessed-contrib';
import WebSocket from 'ws';
import Header from './header.js';
import KbTree from './kbTree.js';
import ChatLog from './chatLog.js';
import InputBar from './inputBar.js';
import Help from './help.js';
import StatusBar from './statusBar.js';

class Tui {
    constructor(wsManager) {
        this.wsManager = wsManager;
        
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'MCR TUI REPL',
            cursor: {
                artificial: true,
                shape: {
                    bold: true,
                    underline: true,
                    blink: true
                }
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
        // Set initial focus
        this.focusOrder[this.currentFocus].focus();
        
        // Render the screen
        this.screen.render();
    }

    setupHotkeys() {
        this.screen.key(['escape', 'q', 'C-c'], () => process.exit(0));
        this.screen.key(['C-w'], this.focusNext.bind(this));
        this.screen.key(['?'], this.help.toggle.bind(this.help));
    }

    focusNext() {
        const components = [this.inputBar, this.chatLog, this.kbTree];
        const currentIndex = components.findIndex(c => c.hasFocus());
        const nextIndex = (currentIndex + 1) % components.length;
        components[nextIndex].focus();
    }

    setupEventHandlers() {
        // WebSocket events
        this.wsManager.onConnect(() => {
            this.logSystemMessage('🚀 Connected to MCR server');
            this.statusBar.updateStatus('{green-fg}Connected{/green-fg}');
            
            // Request initial knowledge base
            this.wsManager.invoke('mcr.handle', { naturalLanguageText: '__GET_KB__' });
        });

        this.wsManager.onDisconnect(() => {
            this.logSystemMessage('🔌 Disconnected from MCR server');
            this.statusBar.updateStatus('{red-fg}Disconnected{/red-fg}');
        });

        this.wsManager.onMessage((message) => {
            this.handleWebSocketMessage(message);
        });

        // Input bar submission
        this.inputBar.onSubmit(text => {
            this.handleUserInput(text);
        });
    }

    handleWebSocketMessage(message) {
        // Process message from MCR server
        try {
            if (typeof message === 'string') {
                message = JSON.parse(message);
            }
            
            switch (message.type) {
                case 'result':
                    this.handleMcrResult(message);
                    break;
                case 'error':
                    this.handleMcrError(message);
                    break;
                case 'connection_ack':
                    this.logSystemMessage(message.message);
                    break;
                case 'session_created':
                    this.logSystemMessage(`Session created: ${message.payload.sessionId}`);
                    break;
                default:
                    this.logSystemMessage(`Unhandled message type: ${message.type}`);
            }
        } catch (error) {
            this.logSystemMessage(`Error parsing message: ${error.message}`);
        }
    }

    handleMcrResult(result) {
        if (result.payload.success) {
            let content = '';
            if (result.payload.data?.answer) {
                content = blessed.escape(result.payload.data.answer);
            } else if (result.payload.message) {
                content = blessed.escape(result.payload.message);
            } else {
                content = blessed.escape(JSON.stringify(result.payload, null, 2));
            }
            this.chatLog.log(`✅ {green-fg}System:{/green-fg} ${content}`);
        } else {
            let errorMessage = `❌ Error: ${blessed.escape(result.payload.error || 'Unknown error')}`;
            if (result.payload.details) {
                errorMessage += ` - ${blessed.escape(JSON.stringify(result.payload.details))}`;
            }
            this.chatLog.log(`🔥 {red-fg}System:{/red-fg} ${errorMessage}`);
        }

        if (result.payload.data?.fullKnowledgeBase) {
            this.kbTree.setData(result.payload.data.fullKnowledgeBase);
        }
        
        this.screen.render();
    }

    handleUserInput(text) {
        // Handle commands
        if (text.startsWith('/')) {
            this.handleCommand(text);
            return;
        }
        
        if (!text.trim()) {
            return; // Ignore empty input
        }
        
        // Log the input
        this.chatLog.log(`{cyan-fg}You:{/cyan-fg} ${text}`);
        
        // Send to server
        this.wsManager.invoke('mcr.handle', { naturalLanguageText: text })
            .catch(error => {
                this.chatLog.log('{red-fg}Not connected to server{/red-fg}');
            });
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
                this.wsManager.invoke('kb.clear', {})
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

export default Tui;
