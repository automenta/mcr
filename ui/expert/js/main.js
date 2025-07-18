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
