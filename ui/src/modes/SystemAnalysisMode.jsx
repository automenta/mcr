// ui/src/modes/SystemAnalysisMode.jsx
import React, { useState, useEffect } from 'react';
import { apiClient } from '../apiService';

// Placeholder for individual views within System Analysis Mode
const StrategyLeaderboardView = () => {
    const [performanceData, setPerformanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        // apiClient.get_strategy_performance() // Assuming this tool will be implemented
        //     .then(result => {
        //         if (result.success) {
        //             setPerformanceData(result.data);
        //         } else {
        //             setError(result.error?.message || "Failed to fetch performance data");
        //         }
        //     })
        //     .catch(err => setError(err.message))
        //     .finally(() => setLoading(false));

        // Placeholder data for now
        setTimeout(() => { // Simulate API call
            setPerformanceData([
                { id: 'sir-r1', name: 'SIR R1', accuracy: 0.85, latency: 120, cost: 0.05, testCases: 100, failures: 15 },
                { id: 'direct-s1', name: 'Direct S1', accuracy: 0.70, latency: 80, cost: 0.02, testCases: 100, failures: 30 },
            ]);
            setLoading(false);
        }, 1000);
    }, []);

    if (loading) return <p className="loading-text">Loading strategy performance...</p>;
    if (error) return <p className="error-text">Error: {error}</p>;

    return (
        <div className="dashboard-section">
            <h3>Strategy Leaderboard</h3>
            <table>
                <thead>
                    <tr>
                        <th>Strategy Name (ID)</th>
                        <th>Accuracy</th>
                        <th>Avg Latency (ms)</th>
                        <th>Avg Cost ($)</th>
                        <th>Test Cases</th>
                        <th>Failures</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {performanceData.map(strategy => (
                        <tr key={strategy.id}>
                            <td>{strategy.name} ({strategy.id})</td>
                            <td>{(strategy.accuracy * 100).toFixed(1)}%</td>
                            <td>{strategy.latency}</td>
                            <td>{strategy.cost.toFixed(3)}</td>
                            <td>{strategy.testCases}</td>
                            <td>{strategy.failures}</td>
                            <td><button className="secondary" onClick={() => alert(`Deep dive into ${strategy.name}`)}>Deep Dive</button></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const CurriculumExplorerView = () => {
    const [evalCases, setEvalCases] = useState([]); // { id, name, content }
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // setLoading(true);
        // apiClient.get_evaluation_cases()
        //     .then(...)
        //     .finally(() => setLoading(false));
        // Placeholder:
        setEvalCases([
            { id: 'case1', name: 'Family Relations - Basic', content: 'Assert: John is father of Mary. Query: Who is father of Mary?' },
            { id: 'case2', name: 'Transitivity - Simple', content: 'Assert: A is larger than B. Assert: B is larger than C. Query: Is A larger than C?' },
        ]);
    }, []);

    if (loading) return <p className="loading-text">Loading evaluation cases...</p>;
    if (error) return <p className="error-text">Error: {error}</p>;

    return (
        <div className="dashboard-section">
            <h3>Curriculum Explorer</h3>
            <ul className="data-list">
                {evalCases.map(ec => (
                    <li key={ec.id}>
                        <span>{ec.name}</span>
                        <div>
                            <button className="secondary" onClick={() => alert(`View/Edit: ${ec.name}\n\n${ec.content}`)}>View/Edit</button>
                            <button className="secondary" onClick={() => alert(`Generate variations for ${ec.name}`)}>Generate Variations</button>
                        </div>
                    </li>
                ))}
            </ul>
            <button onClick={() => alert("Create new test case UI")}>Create New Test Case</button>
        </div>
    );
};

const EvolverControlPanelView = () => {
    const [logOutput, setLogOutput] = useState('');
    const [isEvolving, setIsEvolving] = useState(false);

    const handleRunEvolver = async (type) => {
        setIsEvolving(true);
        setLogOutput(prev => prev + `\nStarting ${type} evolution cycle...\n`);
        // apiClient.run_evolver_cycle({ type })
        //  .then(result => { ... append to log ...})
        //  .catch(err => { ... append error to log ...})
        //  .finally(() => setIsEvolving(false));
        setTimeout(() => { // Simulate
            setLogOutput(prev => prev + `Evolution cycle ${type} completed. (Simulated)\n`);
            setIsEvolving(false);
        }, 3000);
    };

    return (
        <div className="dashboard-section">
            <h3>Evolver Control Panel</h3>
            <div>
                <button onClick={() => handleRunEvolver('bootstrap')} disabled={isEvolving}>Run Bootstrap</button>
                <button onClick={() => handleRunEvolver('single')} disabled={isEvolving}>Run Single Cycle</button>
                <button onClick={() => alert("Continuous evolution not implemented yet")} disabled={isEvolving}>Start Continuous Evolution</button>
            </div>
            <h4>Evolution Log:</h4>
            <pre style={{ backgroundColor: '#333', color: '#eee', padding: '10px', height: '200px', overflowY: 'auto' }}>
                {logOutput || "No evolution activity yet."}
            </pre>
        </div>
    );
};


const SystemAnalysisMode = ({ availableTools }) => {
  // This mode could have sub-navigation to switch between different analysis views
  const [currentView, setCurrentView] = useState('leaderboard'); // 'leaderboard', 'curriculum', 'evolver'

  return (
    <div className="dashboard">
      <div style={{ padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '10px' }}>
        <button onClick={() => setCurrentView('leaderboard')} disabled={currentView === 'leaderboard'}>Strategy Leaderboard</button>
        <button onClick={() => setCurrentView('curriculum')} disabled={currentView === 'curriculum'}>Curriculum Explorer</button>
        <button onClick={() => setCurrentView('evolver')} disabled={currentView === 'evolver'}>Evolver Control</button>
      </div>

      {currentView === 'leaderboard' && <StrategyLeaderboardView />}
      {currentView === 'curriculum' && <CurriculumExplorerView />}
      {currentView === 'evolver' && <EvolverControlPanelView />}

      {/* Example of checking if a tool is available:
      {availableTools.find(tool => tool.name === 'get_strategy_performance') ?
        <p>get_strategy_performance tool is available.</p> :
        <p>get_strategy_performance tool is NOT available.</p>
      }
      */}
    </div>
  );
};

export default SystemAnalysisMode;
