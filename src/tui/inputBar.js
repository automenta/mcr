const blessed = require('blessed');

class InputBar {
    constructor(grid) {
        this.element = grid.set(10, 4, 2, 8, blessed.textbox, {
            label: ' {bold}💬 Input 💬{/} ',
            inputOnFocus: true,
            style: {
                fg: 'white',
                bg: '#1E1E1E',
                border: {
                    fg: '#5E5E5E',
                    bg: '#1E1E1E'
                },
                focus: {
                    bg: '#2E2E2E',
                    border: {
                        fg: '#8A8A8A',
                        bg: '#2E2E2E'
                    }
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

        this.element.key('tab', () => {
            const text = this.element.getValue();
            if (text.startsWith('/')) {
                const commands = ['/exit', '/clear', '/clear-kb', '/help'];
                const currentCommand = text.slice(1);
                const matchingCommands = commands.filter(c => c.startsWith(text));
                if (matchingCommands.length === 1) {
                    this.element.setValue(matchingCommands[0]);
                } else if (matchingCommands.length > 1) {
                    // In a real app, you might show a list of suggestions.
                    // For now, we'll just cycle through them.
                    const currentIndex = matchingCommands.indexOf(text);
                    const nextIndex = (currentIndex + 1) % matchingCommands.length;
                    this.element.setValue(matchingCommands[nextIndex]);
                }
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

    focus() {
        this.element.focus();
    }

    hasFocus() {
        return this.element.focused;
    }
}

module.exports = InputBar;
