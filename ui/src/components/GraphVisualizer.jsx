import React, { useLayoutEffect, useCallback, useMemo } from 'react';
import ReactFlow, { ReactFlowProvider, useNodesState, useEdgesState, useReactFlow, Controls, Background } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { motion, useSpring } from 'framer-motion';
import { generateEmbeddingBitmap } from '../utils/embeddingViz';

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes, edges, direction = 'TB') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? 'left' : 'top';
    node.sourcePosition = isHorizontal ? 'right' : 'bottom';

    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

const CustomNode = ({ data }) => {
  const embeddingBitmap = useMemo(() => generateEmbeddingBitmap(data.embedding), [data.embedding]);
  const x = useSpring(0, { stiffness: 300, damping: 20 });
  const y = useSpring(0, { stiffness: 300, damping: 20 });

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      whileHover={{ scale: 1.05, boxShadow: '0px 0px 8px rgb(255,255,255)' }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.5}
      style={{
        x,
        y,
        background: data.color || '#fff',
        backgroundImage: embeddingBitmap ? `url(${embeddingBitmap})` : 'none',
        backgroundSize: 'cover',
        padding: '10px',
        borderRadius: '5px',
        border: `2px solid ${data.borderColor || '#000'}`,
        width: nodeWidth,
        height: nodeHeight,
      }}
    >
      {data.label}
    </motion.div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const LayoutFlow = ({ data, layout, size }) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { fitView } = useReactFlow();

    const onLayout = useCallback(
        (direction) => {
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
                data.nodes,
                data.edges,
                direction
            );
            setNodes(layoutedNodes);
            setEdges(layoutedEdges);
        },
        [data.nodes, data.edges]
    );

    useLayoutEffect(() => {
        onLayout('TB');
        fitView();
    }, [onLayout, fitView, data]);

    return (
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
    );
};

const GraphVisualizer = ({ data, layout, size }) => {
  return (
    <div style={{ height: '100%' }}>
        <ReactFlowProvider>
            <LayoutFlow data={data} layout={layout} size={size} />
        </ReactFlowProvider>
    </div>
  );
};

export default GraphVisualizer;
