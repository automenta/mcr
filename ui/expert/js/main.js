import './components/Repl.js';
import './components/SystemState.js';
import './components/OntologyManager.js';
import './components/StrategyManager.js';
import './components/EvaluationManager.js';
import './components/EvaluationResults.js';
import './components/GraphVisualizer.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded and parsed');

    const tabButtons = document.querySelectorAll('.tab-button');
    const tabPanels = document.querySelectorAll('.tab-panel');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const tab = button.getAttribute('data-tab');
            tabPanels.forEach(panel => {
                if (panel.id === tab) {
                    panel.classList.add('active');
                } else {
                    panel.classList.remove('active');
                }
            });
        });
    });
});
