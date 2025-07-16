import React, { useMemo } from 'react';
import ReactFlow, {
	ReactFlowProvider,
	useNodesState,
	useEdgesState,
	Controls,
	Background,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { generateEmbeddingBitmap } from '../utils/embeddingViz';

const CustomNode = ({ data }) => {
	const style = {
		padding: 10,
		border: '1px solid #777',
		borderRadius: 5,
		background: '#fff',
	};

	if (data.embedding) {
		style.backgroundImage = `url(${generateEmbeddingBitmap(data.embedding)})`;
		style.backgroundSize = 'cover';
	}

	return (
		<div style={style}>
			<div>{data.label}</div>
		</div>
	);
};

const nodeTypes = {
	custom: CustomNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
	const isHorizontal = direction === 'LR';
	dagreGraph.setGraph({ rankdir: direction });

	nodes.forEach(node => {
		dagreGraph.setNode(node.id, { width: 150, height: 50 });
	});

	edges.forEach(edge => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	dagre.layout(dagreGraph);

	nodes.forEach(node => {
		const nodeWithPosition = dagreGraph.node(node.id);
		node.targetPosition = isHorizontal ? 'left' : 'top';
		node.sourcePosition = isHorizontal ? 'right' : 'bottom';

		// We are shifting the dagre node position (anchor=center center) to the top left
		// so it matches the React Flow node anchor point (top left).
		node.position = {
			x: nodeWithPosition.x - 150 / 2,
			y: nodeWithPosition.y - 50 / 2,
		};

		return node;
	});

	return { nodes, edges };
};

const GraphVisualizer = ({ data, layout = 'dagre' }) => {
	const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(() => {
		if (layout === 'dagre') {
			return getLayoutedElements(data.nodes, data.edges);
		}
		return data;
	}, [data.nodes, data.edges, layout]);

	const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
	const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

	return (
		<ReactFlowProvider>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				nodeTypes={nodeTypes}
				fitView
			>
				<Controls />
				<Background />
			</ReactFlow>
		</ReactFlowProvider>
	);
};

export default GraphVisualizer;
