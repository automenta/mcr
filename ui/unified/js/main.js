import '@shared/mcr-ui-lib.js';
import '@shared/components/GraphVisualizer.js';
import '@shared/components/UtilityManager.js';

document.addEventListener('DOMContentLoaded', () => {
	const container = document.getElementById('unified-container');
	container.innerHTML = `
    <repl-component></repl-component>
    <graph-visualizer></graph-visualizer>
    <utility-manager></utility-manager>
  `;
});
