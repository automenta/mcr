import '@shared/components/index.js';

document.addEventListener('DOMContentLoaded', () => {
	const container = document.getElementById('unified-container');
	container.innerHTML = `
    <repl-repl></repl-repl>
    <graph-visualizer></graph-visualizer>
    <div class="manager-grid">
        <ontology-manager></ontology-manager>
        <curriculum-manager></curriculum-manager>
        <strategy-manager></strategy-manager>
        <utility-manager></utility-manager>
        <evaluation-manager></evaluation-manager>
        <evaluation-results></evaluation-results>
    </div>
  `;
});
