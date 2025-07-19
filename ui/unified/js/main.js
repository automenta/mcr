import '@shared/components/index.js';

document.addEventListener('DOMContentLoaded', () => {
	const container = document.getElementById('unified-container');
	container.innerHTML = `
    <repl-repl></repl-repl>
    <graph-visualizer></graph-visualizer>
    <utility-manager></utility-manager>
  `;
});
