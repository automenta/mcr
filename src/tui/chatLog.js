const blessed = require('blessed');

class ChatLog {
    constructor(grid) {
        this.element = grid.set(1, 4, 9, 8, blessed.log, {
            label: '📝 Chat/Log 📝',
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
