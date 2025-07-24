import blessed from 'blessed';

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
  {cyan-fg}Ctrl-C{/cyan-fg}, {cyan-fg}q{/cyan-fg}, {cyan-fg}escape{/cyan-fg}: Quit
  {cyan-fg}Ctrl-W{/cyan-fg}: Cycle focus between components
  {cyan-fg}Ctrl-L{/cyan-fg}: Clear the chat log
  {cyan-fg}?{/cyan-fg}: Toggle this help screen

{bold}Commands:{/bold}
  {cyan-fg}/help{/cyan-fg}: Show this help screen
  {cyan-fg}/clear{/cyan-fg}: Clear the chat log
  {cyan-fg}/clear-kb{/cyan-fg}: Clear the knowledge base
  {cyan-fg}/exit{/cyan-fg}: Exit the REPL
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

export default Help;
