import React, { useState } from 'react';
import StrategyLeaderboard from './SystemAnalysis/StrategyLeaderboard';
import StrategyDeepDive from './SystemAnalysis/StrategyDeepDive';
import CurriculumExplorer from './SystemAnalysis/CurriculumExplorer';
import EvolverControlPanel from './SystemAnalysis/EvolverControlPanel';
import HybridMetrics from './SystemAnalysis/HybridMetrics';
import './SystemAnalysisMode.css';

const SystemAnalysisMode = () => {
	const [currentAnalysisView, setCurrentAnalysisView] = useState('leaderboard'); // 'leaderboard', 'deepDive', 'curriculum', 'evolver'
	const [selectedStrategyIdForDeepDive, setSelectedStrategyIdForDeepDive] =
		useState(null);

	const handleNavigateToDeepDive = strategyId => {
		setSelectedStrategyIdForDeepDive(strategyId);
		setCurrentAnalysisView('deepDive');
	};

	const renderCurrentView = () => {
		switch (currentAnalysisView) {
			case 'leaderboard':
				return (
					<StrategyLeaderboard onSelectStrategy={handleNavigateToDeepDive} />
				);
			case 'deepDive':
				return (
					<StrategyDeepDive
						strategyId={selectedStrategyIdForDeepDive}
						onBack={() => {
							setSelectedStrategyIdForDeepDive(null);
							setCurrentAnalysisView('leaderboard');
						}}
					/>
				);
			case 'curriculum':
				return <CurriculumExplorer />;
			case 'evolver':
				return <EvolverControlPanel />;
			case 'hybrid':
				return <HybridMetrics />;
			default:
				return (
					<StrategyLeaderboard onSelectStrategy={handleNavigateToDeepDive} />
				);
		}
	};

	return (
		<div className="system-analysis-mode">
			<div className="analysis-sidebar">
				<h2>System Analysis</h2>
				<nav className="analysis-nav">
					<button
						onClick={() => {
							setSelectedStrategyIdForDeepDive(null);
							setCurrentAnalysisView('leaderboard');
						}}
						disabled={
							currentAnalysisView === 'leaderboard' &&
							!selectedStrategyIdForDeepDive
						}
					>
						Leaderboard
					</button>
					<button
						onClick={() => setCurrentAnalysisView('curriculum')}
						disabled={currentAnalysisView === 'curriculum'}
					>
						Curriculum
					</button>
					<button
						onClick={() => setCurrentAnalysisView('evolver')}
						disabled={currentAnalysisView === 'evolver'}
					>
						Evolver
					</button>
					<button
						onClick={() => setCurrentAnalysisView('hybrid')}
						disabled={currentAnalysisView === 'hybrid'}
					>
						Hybrid Metrics
					</button>
				</nav>
			</div>
			<div className="analysis-view-content">{renderCurrentView()}</div>
		</div>
	);
};

export default SystemAnalysisMode;
