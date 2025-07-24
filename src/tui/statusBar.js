import blessed from 'blessed';

class StatusBar {
    constructor(grid) {
        this.element = grid.set(11, 0, 1, 12, blessed.box, {
            content: this.getContent(),
            tags: true,
            style: {
                fg: 'white',
                bg: '#2E2E2E',
            }
        });
    }

    getContent(status = 'Disconnected') {
        const hotkeys = [
            '{cyan-fg}C-c{/cyan-fg} Quit',
            '{cyan-fg}C-w{/cyan-fg} Focus',
            '{cyan-fg}C-l{/cyan-fg} Clear Log',
            '{cyan-fg}C-y{/cyan-fg} Copy',
            '{cyan-fg}?{/cyan-fg} Help'
        ].join(' | ');
        return ` {bold}Status:{/bold} ${status} | ${hotkeys}`;
    }

    updateStatus(status) {
        this.element.setContent(this.getContent(status));
        this.element.screen.render();
    }
}

export default StatusBar;
