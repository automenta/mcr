const blessed = require('blessed');
const chalk = require('chalk');

class Header {
    constructor(grid) {
        this.element = grid.set(0, 0, 1, 12, blessed.box, {
            content: this.gradientTitle(0),
            tags: true,
        });

        this.offset = 0;
        setInterval(() => {
            this.offset += 0.01;
            this.element.setContent(this.gradientTitle(this.offset));
            this.element.screen.render();
        }, 50);
    }

    gradientTitle(offset) {
        const title = '🤖 MCR TUI REPL 🤖';
        const colors = [
            [123, 104, 238],
            [72, 209, 204],
            [135, 206, 250],
            [255, 105, 180],
        ];
        let gradient = '';
        for (let i = 0; i < title.length; i++) {
            const ratio = (i / (title.length - 1) + offset) % 1;
            const colorIndex = Math.floor(ratio * (colors.length - 1));
            const nextColorIndex = (colorIndex + 1) % (colors.length -1);

            const startColor = colors[colorIndex];
            const endColor = colors[nextColorIndex];

            const interColorRatio = (ratio * (colors.length -1)) - colorIndex;

            const r = Math.round(startColor[0] + (endColor[0] - startColor[0]) * interColorRatio);
            const g = Math.round(startColor[1] + (endColor[1] - startColor[1]) * interColorRatio);
            const b = Math.round(startColor[2] + (endColor[2] - startColor[2]) * interColorRatio);
            gradient += chalk.rgb(r, g, b)(title[i]);
        }
        return `{center}${gradient}{/center}`;
    }
}

module.exports = Header;
