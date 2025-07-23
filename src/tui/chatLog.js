const blessed = require('blessed');
const clipboardy = require('clipboardy');

class ChatLog {
    constructor(grid) {
        this.element = grid.set(1, 4, 9, 8, blessed.log, {
            label: ' {bold}📝 Chat/Log 📝{/} ',
            content: '',
            tags: true,
            scrollable: true,
            wrap: true,
            alwaysScroll: true,
            mouse: true,
            keys: true,
            vi: true,
            scrollbar: {
                ch: '┃',
                track: {
                    bg: '#2E2E2E'
                },
                style: {
                    fg: 'cyan',
                    inverse: false
                }
            },
            style: {
                fg: '#E0E0E0',
                bg: '#1E1E1E',
                border: {
                    fg: '#5E5E5E',
                    bg: '#1E1E1E'
                }
            }
        });
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.element.log(`{gray-fg}[${timestamp}]{/gray-fg} ${message}`);
    }

    copy() {
        const selectedText = this.element.getSelectedText();
        if (selectedText) {
            clipboardy.writeSync(selectedText);
            this.log('{green-fg}Copied to clipboard!{/green-fg}');
        }
    }

    clear() {
        this.element.setContent('');
    }
}

module.exports = ChatLog;
