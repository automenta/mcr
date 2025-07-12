import React, { useState } from 'react';
// import apiService from '../../apiService'; // Removed as it's not used directly
import StrategyLeaderboard from './SystemAnalysis/StrategyLeaderboard';
import StrategyDeepDive from './SystemAnalysis/StrategyDeepDive';
import CurriculumExplorer from './SystemAnalysis/CurriculumExplorer';
import EvolverControlPanel from './SystemAnalysis/EvolverControlPanel';

const SystemAnalysisMode = () => {
  const [currentAnalysisView, setCurrentAnalysisView] = useState('leaderboard'); // 'leaderboard', 'deepDive', 'curriculum', 'evolver'
  const [selectedStrategyIdForDeepDive, setSelectedStrategyIdForDeepDive] = useState(null);

  const handleNavigateToDeepDive = (strategyId) => {
    setSelectedStrategyIdForDeepDive(strategyId);
    setCurrentAnalysisView('deepDive');
  };

  const renderCurrentView = () => {
    switch (currentAnalysisView) {
      case 'leaderboard':
        return <StrategyLeaderboard onSelectStrategy={handleNavigateToDeepDive} />;
      case 'deepDive':
        return <StrategyDeepDive strategyId={selectedStrategyIdForDeepDive} onBack={() => { setSelectedStrategyIdForDeepDive(null); setCurrentAnalysisView('leaderboard');}} />;
      case 'curriculum':
        return <CurriculumExplorer />;
      case 'evolver':
        return <EvolverControlPanel />;
      default:
        return <StrategyLeaderboard onSelectStrategy={handleNavigateToDeepDive} />;
    }
  };

  return (
    <div className="system-analysis-mode">
      <h2>📊 MCR System Analysis</h2>
      <nav className="analysis-nav">
        <button onClick={() => { setSelectedStrategyIdForDeepDive(null); setCurrentAnalysisView('leaderboard');}} disabled={currentAnalysisView === 'leaderboard' && !selectedStrategyIdForDeepDive}>🏆 Leaderboard</button>
        <button onClick={() => setCurrentAnalysisView('curriculum')} disabled={currentAnalysisView === 'curriculum'}>🎓 Curriculum</button>
        <button onClick={() => setCurrentAnalysisView('evolver')} disabled={currentAnalysisView === 'evolver'}>🧬 Evolver</button>
      </nav>
      <div className="analysis-view-content">
        {renderCurrentView()}
      </div>
    </div>
  );
};

export default SystemAnalysisMode;
