const blessed = require('blessed');

class ChatLog {
    constructor(grid) {
        this.element = grid.set(1, 4, 9, 8, blessed.log, {
            label: ' {bold}📝 Chat/Log 📝{/} ',
            content: '',
            tags: true,
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                track: {
                    bg: '#4A4A4A'
                },
                style: {
                    inverse: true
                }
            },
            style: {
                fg: '#E0E0E0',
                border: {
                    fg: '#5E5E5E'
                }
            }
        });
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        this.element.log(`[${timestamp}] ${message}`);
    }

    clear() {
        this.element.setContent('');
    }
}

module.exports = ChatLog;
