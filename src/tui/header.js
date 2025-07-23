const blessed = require('blessed');
const chalk = require('chalk');

class Header {
    constructor(grid) {
        this.element = grid.set(0, 0, 1, 12, blessed.box, {
            content: this.gradientTitle(),
            tags: true,
        });
    }

    gradientTitle() {
        const title = '🤖 MCR TUI REPL 🤖';
        const colors = [
            [123, 104, 238],
            [72, 209, 204],
            [135, 206, 250]
        ];
        let gradient = '';
        for (let i = 0; i < title.length; i++) {
            const ratio = i / (title.length - 1);
            const colorIndex = Math.floor(ratio * (colors.length - 2));
            const startColor = colors[colorIndex];
            const endColor = colors[colorIndex + 1];
            const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * (ratio * (colors.length - 1) - colorIndex));
            const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * (ratio * (colors.length - 1) - colorIndex));
            const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * (ratio * (colors.length - 1) - colorIndex));
            gradient += chalk.rgb(r, g, b)(title[i]);
        }
        return `{center}${gradient}{/center}`;
    }
}

module.exports = Header;
