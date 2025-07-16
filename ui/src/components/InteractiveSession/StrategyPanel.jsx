// ui/src/components/InteractiveSession/StrategyPanel.jsx
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import apiService from '../../apiService';
import Modal from '../Modal';

const StrategyPanel = ({
	sessionId, // Though not directly used in API calls here, it implies session context
	activeStrategy,
	setActiveStrategy,
	isMcrSessionActive,
	isWsServiceConnected,
	addMessageToHistory,
}) => {
	const [strategies, setStrategies] = useState([]);
	const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
	const [selectedStrategyContent, setSelectedStrategyContent] = useState({
		name: '',
		description: '',
		definition: null,
	});

	const listStrategies = useCallback(async () => {
		if (!isMcrSessionActive || !isWsServiceConnected) {
			setStrategies([]);
			return;
		}
		try {
			const response = await apiService.invokeTool('strategy.list');
			if (response.success) {
				setStrategies(response.data || []);
			} else {
				addMessageToHistory({
					type: 'system',
					text: `❌ Error listing strategies: ${response.message}`,
				});
				setStrategies([]);
			}
		} catch (error) {
			addMessageToHistory({
				type: 'system',
				text: `❌ Error: ${error.message || 'Failed to list strategies'}`,
			});
			setStrategies([]);
		}
	}, [
		isMcrSessionActive,
		isWsServiceConnected,
		addMessageToHistory,
		setStrategies,
	]);

	useEffect(() => {
		if (isMcrSessionActive && isWsServiceConnected) {
			// Condition also in listStrategies
			listStrategies();
		} else {
			setStrategies([]);
		}
	}, [isMcrSessionActive, isWsServiceConnected, sessionId, listStrategies]); // Added listStrategies

	const viewStrategy = strategy => {
		setSelectedStrategyContent({
			name: strategy.name,
			description: strategy.description,
			definition: strategy.definition,
		});
		setIsStrategyModalOpen(true);
	};

	const handleSetStrategy = async strategyId => {
		if (!isMcrSessionActive || !isWsServiceConnected) {
			alert('Connect to a session and ensure WebSocket is active first.');
			return;
		}
		try {
			const response = await apiService.invokeTool('strategy.setActive', {
				strategyId,
			});
			if (response.success && response.data?.activeStrategyId) {
				addMessageToHistory({
					type: 'system',
					text: `✅ Strategy set to ${response.data.activeStrategyId}`,
				});
				setActiveStrategy(response.data.activeStrategyId); // Update parent state
			} else {
				addMessageToHistory({
					type: 'system',
					text: `❌ Error setting strategy: ${response.message || 'Unknown error'}`,
				});
			}
		} catch (error) {
			addMessageToHistory({
				type: 'system',
				text: `❌ Error: ${error.message || 'Failed to set strategy'}`,
			});
		}
	};

	return (
		<div>
			<h4>🛠️ Strategies</h4>
			<button
				onClick={listStrategies}
				disabled={!isMcrSessionActive || !isWsServiceConnected}
				title="Refresh Strategy List"
			>
				🔄 List Strategies
			</button>
			<p className="text-muted" style={{ marginTop: '5px' }}>
				🎯 Active:{' '}
				<strong style={{ color: '#58a6ff' }}>{activeStrategy || 'N/A'}</strong>
			</p>
			{strategies.length === 0 && isMcrSessionActive && (
				<p className="text-muted">🤷 No strategies found.</p>
			)}
			<ul>
				{strategies.map(strat => (
					<li
						key={strat.id || strat.name}
						className={`strategy-item ${activeStrategy === strat.id ? 'active-strategy' : ''}`}
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						}}
					>
						<span>
							{strat.name} <small>({strat.id})</small>
						</span>
						<div>
							<button
								onClick={() => viewStrategy(strat)}
								disabled={!isMcrSessionActive || !isWsServiceConnected}
								title="View Strategy Details"
							>
								👁️ View
							</button>
							<button
								onClick={() => handleSetStrategy(strat.id)}
								disabled={
									!isMcrSessionActive ||
									!isWsServiceConnected ||
									activeStrategy === strat.id
								}
								title="Set as Active Strategy"
								style={{ marginLeft: '5px' }}
							>
								{activeStrategy === strat.id ? '✅ Active' : '➡️ Set'}
							</button>
						</div>
					</li>
				))}
			</ul>

			<Modal
				isOpen={isStrategyModalOpen}
				onClose={() => setIsStrategyModalOpen(false)}
				title={`🛠️ Strategy: ${selectedStrategyContent.name}`}
			>
				<p>
					<strong>Description:</strong>
				</p>
				<p style={{ whiteSpace: 'pre-wrap', marginBottom: '15px' }}>
					{selectedStrategyContent.description || 'No description available.'}
				</p>
				{selectedStrategyContent.definition ? (
					<>
						<p>
							<strong>📜 Definition (JSON):</strong>
						</p>
						<pre
							style={{
								maxHeight: '40vh',
								overflow: 'auto',
								background: '#0d1117',
								border: '1px solid #30363d',
								padding: '10px',
								borderRadius: '4px',
							}}
						>
							{JSON.stringify(selectedStrategyContent.definition, null, 2)}
						</pre>
					</>
				) : (
					<p className="text-muted">
						🤷 Full JSON definition not available for display.
					</p>
				)}
			</Modal>
		</div>
	);
};

export default StrategyPanel;
