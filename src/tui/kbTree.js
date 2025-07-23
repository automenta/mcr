const contrib = require('blessed-contrib');

class KbTree {
    constructor(grid) {
        this.element = grid.set(1, 0, 10, 4, contrib.tree, {
            label: '🌳 Knowledge Base 🌳',
            style: {
                fg: 'green',
                text: 'green',
                border: {
                    fg: 'green'
                }
            }
        });

        this.element.on('select', (node) => {
            if (node.children) {
                node.extended = !node.extended;
                this.element.setData(this.treeData);
            }
        });
    }

    setData(kb) {
        this.treeData = {
            name: 'KB',
            extended: true,
            children: []
        };

        if (kb.facts) {
            this.treeData.children.push({
                name: 'Facts',
                extended: true,
                children: kb.facts.map(f => ({ name: f }))
            });
        }

        if (kb.rules) {
            this.treeData.children.push({
                name: 'Rules',
                extended: true,
                children: kb.rules.map(r => ({ name: r }))
            });
        }
        this.element.setData(this.treeData);
    }
}

module.exports = KbTree;
