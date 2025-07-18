import '../../shared/components/Repl.js';
import '../../shared/components/SystemState.js';
import './components/OntologyManager.js';
import './components/StrategyManager.js';
import './components/EvaluationManager.js';
import './components/EvaluationResults.js';
import './components/GraphVisualizer.js';
import './components/HybridLoopViewer.js';
import './components/BiLevelModelDisplay.js';
import '../../shared/components/ErrorDisplay.js';

import WebSocketService from '../../shared/services/WebSocketService.js';

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

	const hybridLoopViewer = document.querySelector('hybrid-loop-viewer');
	const biLevelModelDisplay = document.querySelector('bi-level-model-display');

	const errorDisplay = document.querySelector('error-display');

	WebSocketService.connect().then(() => {
		WebSocketService.subscribe('hybrid_loop_updated', (message) => {
			hybridLoopViewer.update(message.data);
		});

		WebSocketService.subscribe('bi_level_model_updated', (message) => {
			biLevelModelDisplay.update(message.data);
		});

		WebSocketService.subscribe('error', (message) => {
			errorDisplay.show(message.payload.message);
		});
	});
});
