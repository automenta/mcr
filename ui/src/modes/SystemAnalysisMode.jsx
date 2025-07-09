// ui/src/modes/SystemAnalysisMode.jsx
import React, { useState, useEffect } from 'react';
import { apiClient } from '../apiService';

// Placeholder for individual views within System Analysis Mode

const StrategyDeepDiveView = ({ strategyId, onBack }) => {
    const [strategyDetails, setStrategyDetails] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!strategyId) return;
        setLoading(true);
        setError(null);
        // Assuming get_strategy_performance can take an ID, or filter client-side from full data
        // For now, let's simulate fetching specific details or using passed data
        // This would ideally be a new tool or enhanced get_strategy_performance
        apiClient.get_strategy_performance({ options: { strategyId: strategyId } }) // Fictitious option
            .then(result => {
                if (result.success && result.data) {
                    // If the tool returns an array, find the specific strategy
                    const details = Array.isArray(result.data) ? result.data.find(s => (s.strategyId || s.id) === strategyId) : result.data;
                    if (details) {
                        setStrategyDetails(details);
                    } else {
                        setError(`Details not found for strategy ${strategyId}.`);
                    }
                } else {
                    setError(result.error?.message || `Failed to fetch details for strategy ${strategyId}`);
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, [strategyId]);

    if (loading) return <p className="loading-text">Loading strategy details for {strategyId}...</p>;
    if (error) return <p className="error-text">Error: {error}</p>;
    if (!strategyDetails) return <p>No details available for strategy {strategyId}.</p>;

    return (
        <div className="dashboard-section">
            <button onClick={onBack} className="secondary" style={{marginBottom: '10px'}}>&larr; Back to Leaderboard</button>
            <h3>Strategy Deep Dive: {strategyDetails.name || strategyId}</h3>
            <p><strong>ID:</strong> {strategyDetails.strategyId || strategyDetails.id}</p>
            <p><strong>Accuracy:</strong> {strategyDetails.accuracy !== undefined ? (strategyDetails.accuracy * 100).toFixed(1) + '%' : 'N/A'}</p>
            <p><strong>Avg Latency (ms):</strong> {strategyDetails.latency !== undefined ? strategyDetails.latency : 'N/A'}</p>
            <p><strong>Avg Cost ($):</strong> {strategyDetails.cost !== undefined ? (typeof strategyDetails.cost === 'number' ? strategyDetails.cost.toFixed(3) : JSON.stringify(strategyDetails.cost)) : 'N/A'}</p>
            <p><strong>Test Cases Run:</strong> {strategyDetails.testCases || 'N/A'}</p>
            <p><strong>Failures:</strong> {strategyDetails.failures || 'N/A'}</p>

            <h4>Performance Charts (Placeholder)</h4>
            <div style={{border: '1px dashed #ccc', padding: '10px', margin: '10px 0'}}>Chart for latency over time</div>
            <div style={{border: '1px dashed #ccc', padding: '10px', margin: '10px 0'}}>Chart for cost over time</div>
            <div style={{border: '1px dashed #ccc', padding: '10px', margin: '10px 0'}}>Chart for success rate over time</div>

            <h4>Failed Evaluation Cases (Placeholder)</h4>
            {/* This would list specific eval cases where this strategy failed */}
            <ul>
                <li>Failed Case Example 1 (Details...)</li>
                <li>Failed Case Example 2 (Details...)</li>
            </ul>
        </div>
    );
};


const StrategyLeaderboardView = ({ onNavigateToDeepDive }) => { // Added onNavigateToDeepDive prop
    const [performanceData, setPerformanceData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        apiClient.get_strategy_performance()
            .then(result => {
                if (result.success && Array.isArray(result.data)) {
                    setPerformanceData(result.data);
                } else if (result.success && !Array.isArray(result.data)) {
                    setError("Performance data is not in expected format (array).");
                    setPerformanceData([]);
                } else {
                    setError(result.error?.message || "Failed to fetch performance data");
                    setPerformanceData([]);
                }
            })
            .catch(err => {
                setError(err.message || "An unexpected error occurred.");
                setPerformanceData([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleDeepDive = (strategyId) => {
        if (onNavigateToDeepDive) {
            onNavigateToDeepDive(strategyId);
        } else {
            alert(`Deep dive navigation handler not provided for ${strategyId}`);
        }
    };

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
                    {performanceData.length === 0 && !loading && <tr><td colSpan="7">No performance data available.</td></tr>}
                    {performanceData.map(strategy => (
                        <tr key={strategy.strategyId || strategy.id}>
                            <td>{strategy.name || 'N/A'} ({strategy.strategyId || strategy.id})</td>
                            <td>{strategy.accuracy !== undefined ? (strategy.accuracy * 100).toFixed(1) + '%' : 'N/A'}</td>
                            <td>{strategy.latency !== undefined ? strategy.latency : 'N/A'}</td>
                            <td>{strategy.cost !== undefined ? (typeof strategy.cost === 'number' ? strategy.cost.toFixed(3) : JSON.stringify(strategy.cost)) : 'N/A'}</td>
                            <td>{strategy.testCases || 'N/A'}</td>
                            <td>{strategy.failures || 'N/A'}</td>
                            <td><button className="secondary" onClick={() => handleDeepDive(strategy.strategyId || strategy.id)}>Deep Dive</button></td>
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
        setLoading(true);
        setError(null);
        apiClient.get_evaluation_cases()
            .then(result => {
                if (result.success && result.data) {
                    // The stub returns { baseEvals, sirSpecific }. Combine them or choose.
                    // For simplicity, let's assume data is an array or can be made into one.
                    let combinedCases = [];
                    if (result.data.baseEvals && Array.isArray(result.data.baseEvals)) {
                        combinedCases = combinedCases.concat(result.data.baseEvals.map(c => ({...c, group: 'Base Evals'})));
                    }
                    if (result.data.sirSpecific && Array.isArray(result.data.sirSpecific)) {
                        combinedCases = combinedCases.concat(result.data.sirSpecific.map(c => ({...c, group: 'SIR Specific'})));
                    }
                    // If the structure is different, this needs adjustment.
                    // The stub in mcrService returns { baseEvals: [...], sirSpecific: [...] }
                    // So, this combination logic is appropriate for that stub.
                    setEvalCases(combinedCases);
                } else {
                    setError(result.error?.message || "Failed to fetch evaluation cases");
                    setEvalCases([]);
                }
            })
            .catch(err => {
                setError(err.message || "An unexpected error occurred while fetching eval cases.");
                setEvalCases([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleGenerateVariations = async (evalCase) => {
        const instructions = prompt(`Enter generation instructions for variations of "${evalCase.description || evalCase.id}":`, "Make it slightly more complex.");
        if (instructions) {
            try {
                const result = await apiClient.generate_eval_variations({
                    options: {
                        baseCaseId: evalCase.id, // Assuming evalCase has an id
                        baseCaseDescription: evalCase.description,
                        generationInstructions: instructions
                    }
                });
                if (result.success) {
                    alert(`Variations generated (simulated): ${JSON.stringify(result.data, null, 2)}`);
                    // Optionally, refresh or add to list
                } else {
                    alert(`Failed to generate variations: ${result.error?.message}`);
                }
            } catch (e) {
                alert(`Error generating variations: ${e.message}`);
            }
        }
    };

    const handleViewEditCase = (evalCase) => {
        // For now, just an alert. A modal would be better.
        const currentContent = JSON.stringify({
            id: evalCase.id,
            description: evalCase.description,
            naturalLanguageInput: evalCase.naturalLanguageInput,
            inputType: evalCase.inputType,
            expectedProlog: evalCase.expectedProlog,
            expectedAnswer: evalCase.expectedAnswer,
            tags: evalCase.tags,
            notes: evalCase.notes
        }, null, 2);
        const newContentStr = prompt(`Editing case: ${evalCase.id}\nGroup: ${evalCase.group}\n\nPaste new JSON content or cancel to view only:`, currentContent);
        if (newContentStr && newContentStr !== currentContent) {
            try {
                const newCaseData = JSON.parse(newContentStr);
                // Assuming the structure from prompt matches what update_evaluation_case expects
                // The stub for update_evaluation_case expects { fileName, content } or { id, content }
                // This is a simplification. A real UI would have separate fields.
                apiClient.update_evaluation_case({ caseData: { ...newCaseData, fileName: `${evalCase.id}.json` /* Example fileName */ } })
                    .then(res => {
                        if (res.success) alert(`Case ${evalCase.id} updated (simulated).`);
                        else alert(`Failed to update ${evalCase.id}: ${res.error?.message}`);
                    })
                    .catch(e => alert(`Error updating ${evalCase.id}: ${e.message}`));
            } catch (e) {
                alert(`Invalid JSON provided for update: ${e.message}`);
            }
        } else if (newContentStr === null) { // User cancelled prompt
             alert(`Viewing case (content was in prompt):\n${evalCase.id}\nGroup: ${evalCase.group}\n(Data was in prompt editor)`);
        }
    };

    const handleCreateCase = () => {
        const newCaseStr = prompt("Enter new evaluation case JSON content:", JSON.stringify({
            id: "new_case_" + Date.now(),
            description: "New test case",
            naturalLanguageInput: "Sample NL input?",
            inputType: "query", // or "assert"
            expectedProlog: "sample_query(X).",
            expectedAnswer: "Some answer",
            tags: ["newly_created"],
            notes: ""
        }, null, 2));
        if (newCaseStr) {
            try {
                const newCaseData = JSON.parse(newCaseStr);
                // The stub for create_evaluation_case expects { fileName, content }
                // This is a simplification.
                apiClient.create_evaluation_case({ caseData: { ...newCaseData, fileName: `${newCaseData.id}.json` /* Example */ } })
                    .then(res => {
                        if (res.success) alert(`Case ${newCaseData.id} created (simulated).`);
                        else alert(`Failed to create case: ${res.error?.message}`);
                    })
                    .catch(e => alert(`Error creating case: ${e.message}`));
            } catch(e) {
                alert(`Invalid JSON for new case: ${e.message}`);
            }
        }
    };


    if (loading) return <p className="loading-text">Loading evaluation cases...</p>;
    if (error) return <p className="error-text">Error: {error}</p>;

    return (
        <div className="dashboard-section">
            <h3>Curriculum Explorer</h3>
            {evalCases.length === 0 && !loading && <p>No evaluation cases found.</p>}
            <ul className="data-list">
                {evalCases.map(ec => (
                    <li key={ec.id}>
                        <span>{ec.description || ec.name || ec.id} (Group: {ec.group || 'N/A'})</span>
                        <div>
                            <button className="secondary" onClick={() => handleViewEditCase(ec)}>View/Edit</button>
                            <button className="secondary" onClick={() => handleGenerateVariations(ec)}>Generate Variations</button>
                        </div>
                    </li>
                ))}
            </ul>
            <button onClick={handleCreateCase}>Create New Test Case</button>
        </div>
    );
};

const EvolverControlPanelView = () => {
    const [logOutput, setLogOutput] = useState('');
    const [isEvolving, setIsEvolving] = useState(false); // For specific cycle runs
    const [evolverStatus, setEvolverStatus] = useState(null);
    const [statusLoading, setStatusLoading] = useState(false);
    const [statusError, setStatusError] = useState(null);

    const appendToLog = (message) => {
        setLogOutput(prev => `${prev}\n[${new Date().toLocaleTimeString()}] ${message}`);
    };

    const fetchEvolverStatus = useCallback(() => {
        setStatusLoading(true);
        apiClient.get_evolver_status()
            .then(result => {
                if (result.success) {
                    setEvolverStatus(result.data);
                    setStatusError(null);
                } else {
                    setStatusError(result.error?.message || "Failed to fetch evolver status");
                }
            })
            .catch(err => {
                setStatusError(err.message || "Error fetching status.");
            })
            .finally(() => setStatusLoading(false));
    }, []);

    useEffect(() => {
        fetchEvolverStatus(); // Initial fetch
        const intervalId = setInterval(fetchEvolverStatus, 15000); // Poll every 15 seconds
        return () => clearInterval(intervalId);
    }, [fetchEvolverStatus]);


    const handleRunEvolverCycle = async (options) => {
        setIsEvolving(true);
        appendToLog(`Starting evolution cycle with options: ${JSON.stringify(options)}...`);
        try {
            const result = await apiClient.run_evolver_cycle({ options }); // Pass options if your tool expects it
            if (result.success) {
                appendToLog(`Evolution cycle started successfully. Message: ${result.message || (result.data ? JSON.stringify(result.data) : '')}`);
            } else {
                appendToLog(`Failed to start evolution cycle: ${result.error?.message || 'Unknown error'}`);
            }
        } catch (error) {
            appendToLog(`Error running evolution cycle: ${error.message}`);
        } finally {
            setIsEvolving(false);
            fetchEvolverStatus(); // Refresh status after action
        }
    };

    // Specific handlers for buttons
    const handleRunBootstrap = () => handleRunEvolverCycle({ type: 'bootstrap', someOtherOption: true }); // Example options
    const handleRunSingleCycle = () => handleRunEvolverCycle({ type: 'single_iteration' });


    return (
        <div className="dashboard-section">
            <h3>Evolver Control Panel</h3>
            <div className="status-section">
                <h4>Current Evolver Status:</h4>
                {statusLoading && <p>Loading status...</p>}
                {statusError && <p className="error-text">Error loading status: {statusError}</p>}
                {evolverStatus && (
                    <div>
                        <p><strong>Status:</strong> {evolverStatus.status}</p>
                        <p><strong>Cycle Count:</strong> {evolverStatus.cycleCount}</p>
                        <p><strong>Best Strategy ID:</strong> {evolverStatus.bestStrategyId}</p>
                        <p><strong>Last Run:</strong> {evolverStatus.lastRun ? new Date(evolverStatus.lastRun).toLocaleString() : 'N/A'}</p>
                        <p><strong>Details:</strong> {evolverStatus.details}</p>
                    </div>
                )}
                <button onClick={fetchEvolverStatus} disabled={statusLoading}>Refresh Status</button>
            </div>
            <div>
                <button onClick={handleRunBootstrap} disabled={isEvolving || statusLoading}>Run Bootstrap</button>
                <button onClick={handleRunSingleCycle} disabled={isEvolving || statusLoading}>Run Single Cycle</button>
                <button onClick={() => alert("Continuous evolution not implemented yet")} disabled={isEvolving || statusLoading}>Start Continuous Evolution</button>
            </div>
            <h4>Evolution Log:</h4>
            <pre className="log-output">
                {logOutput || "No evolution activity initiated from UI yet."}
            </pre>
        </div>
    );
};


const SystemAnalysisMode = ({ availableTools }) => {
  const [currentView, setCurrentView] = useState('leaderboard'); // 'leaderboard', 'deepDive', 'curriculum', 'evolver'
  const [selectedStrategyIdForDeepDive, setSelectedStrategyIdForDeepDive] = useState(null);

  const navigateToDeepDive = (strategyId) => {
    setSelectedStrategyIdForDeepDive(strategyId);
    setCurrentView('deepDive');
  };

  const navigateToLeaderboard = () => {
    setSelectedStrategyIdForDeepDive(null);
    setCurrentView('leaderboard');
  };

  return (
    <div className="dashboard">
      <div style={{ padding: '10px', borderBottom: '1px solid #ccc', marginBottom: '10px' }}>
        <button onClick={navigateToLeaderboard} disabled={currentView === 'leaderboard'}>Strategy Leaderboard</button>
        <button onClick={() => setCurrentView('curriculum')} disabled={currentView === 'curriculum'}>Curriculum Explorer</button>
        <button onClick={() => setCurrentView('evolver')} disabled={currentView === 'evolver'}>Evolver Control</button>
      </div>

      {currentView === 'leaderboard' && <StrategyLeaderboardView onNavigateToDeepDive={navigateToDeepDive} />}
      {currentView === 'deepDive' && selectedStrategyIdForDeepDive &&
        <StrategyDeepDiveView strategyId={selectedStrategyIdForDeepDive} onBack={navigateToLeaderboard} />
      }
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
