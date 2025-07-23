const blessed = require('blessed');

class InputBar {
    constructor(grid) {
        this.element = grid.set(11, 0, 1, 12, blessed.textbox, {
            label: '💬 Input 💬',
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

        this.history = [];
        this.historyIndex = 0;

        this.element.key('up', () => {
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.element.setValue(this.history[this.historyIndex]);
                this.element.screen.render();
            }
        });

        this.element.key('down', () => {
            if (this.historyIndex < this.history.length - 1) {
                this.historyIndex++;
                this.element.setValue(this.history[this.historyIndex]);
                this.element.screen.render();
            } else {
                this.historyIndex = this.history.length;
                this.element.clearValue();
                this.element.screen.render();
            }
        });
    }

    onSubmit(handler) {
        this.element.on('submit', (text) => {
            if (text) {
                this.history.push(text);
                this.historyIndex = this.history.length;
                this.element.clearValue();
                this.element.focus();
                handler(text);
            }
        });
    }
}

module.exports = InputBar;
