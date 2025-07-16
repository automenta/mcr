import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../apiService';
import GraphVisualizer from './GraphVisualizer';

const Sidebar = ({ sessionId, useReasoning }) => {
	const [sessions, setSessions] = useState([]);
	const [activeTab, setActiveTab] = useState('nl');
	const [ltnEnabled, setLtnEnabled] = useState(false);
	const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
	const [layout, setLayout] = useState('grid');
	const [layoutOptions, setLayoutOptions] = useState({});

	const fetchSessions = useCallback(async () => {
		try {
			const response = await apiService.invokeTool('session.list');
			if (response.success && Array.isArray(response.data)) {
				setSessions(response.data);
			}
		} catch (error) {
			console.error('Error fetching sessions:', error);
		}
	}, []);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	const handleToggleLtn = async () => {
		const newLtnState = !ltnEnabled;
		setLtnEnabled(newLtnState);
		try {
			await apiService.invokeTool('config.set', {
				key: 'LTN_ENABLED',
				value: newLtnState,
			});
		} catch (error) {
			console.error('Error updating LTN config:', error);
			setLtnEnabled(!newLtnState);
		}
	};

	const fetchGraphData = useCallback(async () => {
		if (!useReasoning || !sessionId) {
			setGraphData({ nodes: [], edges: [] });
			return;
		}

		let tool = '';
		let params = { sessionId };
		let newLayout = 'dagre';
		let newLayoutOptions = {};

		switch (activeTab) {
			case 'nl':
				tool = 'context.getNL';
				newLayout = 'grid';
				newLayoutOptions = { direction: 'TB' };
				break;
			case 'reasoning':
				tool = 'context.getReasoning';
				newLayout = 'elk';
				newLayoutOptions = { algorithm: 'circular' };
				break;
			case 'kb':
				tool = 'context.getKB';
				newLayout = 'elk';
				newLayoutOptions = { algorithm: 'force' };
				break;
			case 'evolution':
				tool = 'context.getEvolution';
				newLayout = 'grid';
				break;
			default:
				return;
		}

		try {
			const response = await apiService.invokeTool(tool, params);
			if (response.success) {
				setGraphData(response.data);
				setLayout(newLayout);
				setLayoutOptions(newLayoutOptions);
			}
		} catch (error) {
			console.error(`Error fetching ${activeTab} context:`, error);
		}
	}, [activeTab, sessionId, useReasoning]);

	useEffect(() => {
		fetchGraphData();
	}, [fetchGraphData]);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<h3>Sessions</h3>
			<ul
				style={{
					listStyle: 'none',
					padding: 0,
					margin: 0,
					overflowY: 'auto',
					flex: 1,
				}}
			>
				{sessions.map(session => (
					<li
						key={session.id}
						style={{
							padding: '0.5rem',
							borderBottom: '1px solid #eee',
							background: sessionId === session.id ? '#e0e0e0' : 'transparent',
						}}
					>
						{session.id.substring(0, 8)}...
					</li>
				))}
			</ul>
			<hr />
			<h3>Context</h3>
			<div style={{ display: 'flex', justifyContent: 'space-around' }}>
				<button onClick={() => setActiveTab('nl')} disabled={!useReasoning}>
					NL
				</button>
				<button
					onClick={() => setActiveTab('reasoning')}
					disabled={!useReasoning}
				>
					Reasoning
				</button>
				<button onClick={() => setActiveTab('kb')} disabled={!useReasoning}>
					KB
				</button>
				<button
					onClick={() => setActiveTab('evolution')}
					disabled={!useReasoning}
				>
					Evolution
				</button>
			</div>
			<div style={{ marginTop: '1rem', flex: 2, height: '300px' }}>
				<GraphVisualizer
					data={graphData}
					layout={layout}
					layoutOptions={layoutOptions}
				/>
			</div>
			<hr />
			<h3>Config</h3>
			<div>
				<label>
					<input
						type="checkbox"
						checked={ltnEnabled}
						onChange={handleToggleLtn}
					/>
					Enable LTN
				</label>
			</div>
		</div>
	);
};

export default Sidebar;
