const Graph = require('graphology');

class KnowledgeGraph {
	constructor() {
		this.graph = new Graph();
	}

	addTriple(subj, pred, obj) {
		if (!this.graph.hasNode(subj)) this.graph.addNode(subj);
		if (!this.graph.hasNode(obj)) this.graph.addNode(obj);
		this.graph.addEdge(subj, obj, { label: pred });
	}

	queryTriples(pattern) {
		const { subj, pred, obj } = pattern;
		let edges = this.graph.edges();

		if (subj) {
			edges = edges.filter(edge => this.graph.source(edge) === subj);
		}
		if (pred) {
			edges = edges.filter(
				edge => this.graph.getEdgeAttribute(edge, 'label') === pred
			);
		}
		if (obj) {
			edges = edges.filter(edge => this.graph.target(edge) === obj);
		}

		return edges.map(edge => ({
			subj: this.graph.source(edge),
			pred: this.graph.getEdgeAttribute(edge, 'label'),
			obj: this.graph.target(edge),
		}));
	}

	async embedNodes(embeddingBridge) {
		const nodes = this.graph.nodes();
		for (const node of nodes) {
			const label = this.graph.getNodeAttribute(node, 'label') || node;
			const vector = await embeddingBridge.encode(label);
			this.graph.setNodeAttribute(node, 'embedding', vector);
		}
	}

	toJSON() {
		return this.graph.export();
	}

	fromJSON(json) {
		this.graph.import(json);
	}
}

module.exports = KnowledgeGraph;
