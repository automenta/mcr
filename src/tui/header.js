const blessed = require('blessed');

class Header {
    constructor(grid) {
        this.element = grid.set(0, 0, 1, 12, blessed.box, {
            content: '{center}🤖 MCR TUI REPL 🤖{/center}',
            tags: true,
            style: {
                fg: 'blue',
            }
        });
    }
}

module.exports = Header;
