const blessed = require('blessed');

class Help {
    constructor(screen) {
        this.screen = screen;
        this.element = blessed.box({
            top: 'center',
            left: 'center',
            width: '50%',
            height: '50%',
            content: `
{center}{bold}Help{/bold}{/center}

{bold}Hotkeys:{/bold}
  {blue-fg}Ctrl-C{/blue-fg}, {blue-fg}q{/blue-fg}, {blue-fg}escape{/blue-fg}: Quit
  {blue-fg}Ctrl-W{/blue-fg}: Cycle focus between components
  {blue-fg}Ctrl-L{/blue-fg}: Clear the chat log

{bold}Commands:{/bold}
  {blue-fg}/help{/blue-fg}: Show this help screen
  {blue-fg}/clear{/blue-fg}: Clear the chat log
  {blue-fg}/exit{/blue-fg}: Exit the REPL
`,
            tags: true,
            border: {
                type: 'line'
            },
            style: {
                fg: 'white',
                bg: 'black',
                border: {
                    fg: '#f0f0f0'
                }
            }
        });

        this.element.hide();
        this.screen.append(this.element);
        this.element.key(['escape', 'q'], () => this.hide());
    }

    show() {
        this.element.show();
        this.element.focus();
        this.screen.render();
    }

    hide() {
        this.element.hide();
        this.screen.render();
    }

    toggle() {
        if (this.element.visible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

module.exports = Help;
