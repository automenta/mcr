const contrib = require('blessed-contrib');
const blessed = require('blessed');

class KbTree {
    constructor(grid) {
        this.grid = grid;
        this.element = this.grid.set(1, 0, 8, 4, contrib.tree, {
            label: ' {bold}🌳 Knowledge Base 🌳{/} ',
            template: {
                lines: true,
                extend: ' [+] ',
                retract: ' [-] ',
            },
            style: {
                fg: '#A8A8A8',
                text: '#A8A8A8',
                bg: '#1E1E1E',
                border: {
                    fg: '#5E5E5E',
                    bg: '#1E1E1E'
                },
                selected: {
                    bg: '#4A4A4A',
                    fg: 'white',
                    bold: true,
                }
            }
        });

        this.searchBar = this.grid.set(9, 0, 1, 4, blessed.textbox, {
            label: 'Search',
            inputOnFocus: true,
            style: {
                fg: 'white',
                bg: '#1E1E1E',
                border: {
                    fg: '#5E5E5E',
                },
                focus: {
                    bg: '#2E2E2E',
                }
            }
        });

        this.searchBar.on('submit', (text) => {
            this.filter(text);
        });

        this.element.on('select', (node) => {
            if (node.children) {
                node.extended = !node.extended;
                this.element.setData(this.treeData);
            }
        });
    }

    filter(searchText) {
        const filteredTree = {
            name: 'KB',
            extended: true,
            children: []
        };

        const originalTree = this.originalTreeData;

        if (!searchText) {
            this.setData(this.originalKb);
            return;
        }

        if (originalTree.facts) {
            const filteredFacts = originalTree.facts.filter(f => f.includes(searchText));
            if (filteredFacts.length > 0) {
                filteredTree.children.push({
                    name: 'Facts',
                    extended: true,
                    children: filteredFacts.map(f => ({ name: `{blue-fg}${f}{/blue-fg}` }))
                });
            }
        }

        if (originalTree.rules) {
            const filteredRules = originalTree.rules.filter(r => r.includes(searchText));
            if (filteredRules.length > 0) {
                filteredTree.children.push({
                    name: 'Rules',
                    extended: true,
                    children: filteredRules.map(r => ({ name: `{yellow-fg}${r}{/yellow-fg}` }))
                });
            }
        }

        this.treeData = filteredTree;
        this.element.setData(this.treeData);
        this.element.screen.render();
    }

    setData(kb) {
        this.originalKb = kb;
        this.originalTreeData = {
            facts: kb.facts || [],
            rules: kb.rules || []
        };

        this.treeData = {
            name: 'KB',
            extended: true,
            children: []
        };

        if (kb.facts) {
            this.treeData.children.push({
                name: 'Facts',
                extended: true,
                children: kb.facts.map(f => ({ name: `{blue-fg}${f}{/blue-fg}` }))
            });
        }

        if (kb.rules) {
            this.treeData.children.push({
                name: 'Rules',
                extended: true,
                children: kb.rules.map(r => ({ name: `{yellow-fg}${r}{/yellow-fg}` }))
            });
        }
        this.element.setData(this.treeData);
    }
}

module.exports = KbTree;
