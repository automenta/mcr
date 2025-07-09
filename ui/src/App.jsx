import React, { useState, useEffect } from 'react';
import './App.css'; // Using App.css for main layout styles
import apiService from './apiService';

// --- Mode Components ---
// SystemAnalysisMode and its sub-components will be created later
const SystemAnalysisMode = () => {
  const [currentAnalysisView, setCurrentAnalysisView] = useState('leaderboard'); // 'leaderboard', 'deepDive', 'curriculum', 'evolver'
  const [selectedStrategyIdForDeepDive, setSelectedStrategyIdForDeepDive] = useState(null);

  const handleNavigateToDeepDive = (strategyId) => {
    setSelectedStrategyIdForDeepDive(strategyId);
    setCurrentAnalysisView('deepDive');
  };

  const StrategyLeaderboard = ({ onSelectStrategy }) => {
    const [leaderboardData, setLeaderboardData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const fetchLeaderboard = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiService.invokeTool('analysis.get_strategy_leaderboard');
        if (response.success) {
          setLeaderboardData(response.data || []);
        } else {
          setError(response.message || 'Failed to fetch leaderboard data.');
          setLeaderboardData([]);
        }
      } catch (err) {
        setError(err.message || 'An unexpected error occurred.');
        setLeaderboardData([]);
      }
      setIsLoading(false);
    };

    useEffect(() => {
      fetchLeaderboard(); // Fetch on component mount
    }, []);

    return (
      <div>
        <h4>Strategy Leaderboard</h4>
        <button onClick={fetchLeaderboard} disabled={isLoading}>
          {isLoading ? 'Loading...' : 'Refresh Leaderboard'}
        </button>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {isLoading && !leaderboardData.length && <p>Loading data...</p>}
        {!isLoading && !leaderboardData.length && !error && <p>No leaderboard data available.</p>}
        {leaderboardData.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Strategy Name</th>
                <th>Strategy ID</th>
                <th>Evaluations</th>
                <th>Success Rate</th>
                <th>Avg Latency (ms)</th>
                <th>Avg Cost ($)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.map((row, index) => (
                <tr key={row.strategyId || index}>
                  <td>{row.strategyName}</td>
                  <td>{row.strategyId}</td>
                  <td>{row.evaluations}</td>
                  <td>{typeof row.successRate === 'number' ? row.successRate.toFixed(3) : 'N/A'}</td>
                  <td>{typeof row.avgLatencyMs === 'number' ? row.avgLatencyMs.toFixed(0) : 'N/A'}</td>
                  <td>{typeof row.avgCost === 'number' ? row.avgCost.toFixed(5) : 'N/A'}</td>
                  <td>
                    <button onClick={() => onSelectStrategy(row.strategyId)}>View Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const StrategyDeepDive = ({ strategyId, onBack }) => {
    const [details, setDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
      if (!strategyId) return;
      const fetchDetails = async () => {
        setIsLoading(true);
        setError(null);
        setDetails(null);
        try {
          const response = await apiService.invokeTool('analysis.get_strategy_details', { strategyId });
          if (response.success) {
            setDetails(response.data);
          } else {
            setError(response.message || `Failed to fetch details for ${strategyId}.`);
          }
        } catch (err) {
          setError(err.message || 'An unexpected error occurred.');
        }
        setIsLoading(false);
      };
      fetchDetails();
    }, [strategyId]);

    if (!strategyId) return <p>No strategy selected for deep dive.</p>;
    if (isLoading) return <p>Loading strategy details for {strategyId}...</p>;
    if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
    if (!details) return <p>No details found for strategy {strategyId}.</p>;

    return (
      <div>
        <button onClick={onBack} style={{marginBottom: '15px'}}>&larr; Back to Leaderboard</button>
        <h3>Strategy Deep Dive: {details.definition?.name || strategyId}</h3>
        <p><strong>ID:</strong> {details.strategyId}</p>
        <p><strong>Hash:</strong> {details.hash}</p>

        <h4>Summary Statistics</h4>
        <pre>{JSON.stringify(details.summary, null, 2)}</pre>

        <h4>Definition</h4>
        <details>
          <summary>View Strategy JSON Definition</summary>
          <pre style={{maxHeight: '300px', overflow:'auto', border:'1px solid #ccc', padding:'10px', background:'#f9f9f9'}}>
            {JSON.stringify(details.definition, null, 2)}
          </pre>
        </details>

        <h4>Performance Runs ({details.runs?.length || 0})</h4>
        {details.runs && details.runs.length > 0 ? (
          <div style={{maxHeight: '500px', overflowY: 'auto'}}>
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Example ID</th>
                  <th>LLM Model</th>
                  <th>Latency (ms)</th>
                  <th>Metrics</th>
                  <th>Cost</th>
                  <th>Raw Output</th>
                </tr>
              </thead>
              <tbody>
                {details.runs.map(run => (
                  <tr key={run.id}>
                    <td>{new Date(run.timestamp).toLocaleString()}</td>
                    <td>{run.example_id}</td>
                    <td>{run.llm_model_id || 'N/A'}</td>
                    <td>{run.latency_ms}</td>
                    <td><pre>{JSON.stringify(run.metrics, null, 2)}</pre></td>
                    <td><pre>{JSON.stringify(run.cost, null, 2)}</pre></td>
                    <td><details><summary>View Output</summary><pre>{run.raw_output}</pre></details></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>No performance runs found for this strategy hash.</p>}
      </div>
    );
  };

  const CurriculumExplorer = () => {
    const [curriculaList, setCurriculaList] = useState([]);
    const [selectedCurriculum, setSelectedCurriculum] = useState(null); // Stores { id, name, cases: [] }
    const [isLoadingList, setIsLoadingList] = useState(false);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [error, setError] = useState(null);

    const fetchCurriculaList = async () => {
      setIsLoadingList(true);
      setError(null);
      try {
        const response = await apiService.invokeTool('analysis.list_eval_curricula');
        if (response.success) {
          setCurriculaList(response.data || []);
        } else {
          setError(response.message || 'Failed to fetch curricula list.');
          setCurriculaList([]);
        }
      } catch (err) {
        setError(err.message || 'An unexpected error occurred while fetching list.');
        setCurriculaList([]);
      }
      setIsLoadingList(false);
    };

    const fetchCurriculumDetails = async (curriculumId) => {
      if (!curriculumId) return;
      setIsLoadingDetails(true);
      setError(null); // Clear previous detail errors
      setSelectedCurriculum(null); // Clear previous details
      try {
        const response = await apiService.invokeTool('analysis.get_curriculum_details', { curriculumId });
        if (response.success) {
          setSelectedCurriculum(response.data); // data should be { id, name, cases: [] }
        } else {
          setError(response.message || `Failed to fetch details for ${curriculumId}.`);
        }
      } catch (err) {
        setError(err.message || `An unexpected error occurred while fetching details for ${curriculumId}.`);
      }
      setIsLoadingDetails(false);
    };

    useEffect(() => {
      fetchCurriculaList(); // Fetch list on component mount
    }, []);

    return (
      <div>
        <h4>Curriculum Explorer</h4>
        {isLoadingList && <p>Loading curricula list...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}

        <div style={{ display: 'flex', maxHeight: '80vh' }}>
          <div style={{ width: '30%', borderRight: '1px solid #ccc', paddingRight: '10px', overflowY: 'auto' }}>
            <h5>Available Curricula Files</h5>
            <button onClick={fetchCurriculaList} disabled={isLoadingList}>Refresh List</button>
            {curriculaList.length > 0 ? (
              <ul>
                {curriculaList.map(cur => (
                  <li key={cur.id} onClick={() => fetchCurriculumDetails(cur.id)}
                      style={{ cursor: 'pointer', fontWeight: selectedCurriculum?.id === cur.id ? 'bold' : 'normal', padding: '5px 0' }}>
                    {cur.name} ({cur.caseCount} cases)
                    <br />
                    <small style={{color: '#777'}}>{cur.path}</small>
                  </li>
                ))}
              </ul>
            ) : (
              !isLoadingList && <p>No curricula files found.</p>
            )}
          </div>

          <div style={{ width: '70%', paddingLeft: '10px', overflowY: 'auto' }}>
            {isLoadingDetails && <p>Loading curriculum details...</p>}
            {selectedCurriculum ? (
              <div>
                <h5>Cases from: {selectedCurriculum.name}</h5>
                {selectedCurriculum.cases && selectedCurriculum.cases.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Description</th>
                        <th>Input Type</th>
                        <th>NL Input</th>
                        <th>Expected Prolog</th>
                        <th>Expected Answer</th>
                        <th>Tags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCurriculum.cases.map((c, index) => (
                        <tr key={c.id || index}>
                          <td>{c.id}</td>
                          <td>{c.description}</td>
                          <td>{c.inputType}</td>
                          <td><pre>{c.naturalLanguageInput}</pre></td>
                          <td><pre>{Array.isArray(c.expectedProlog) ? c.expectedProlog.join('\n') : c.expectedProlog}</pre></td>
                          <td>{c.expectedAnswer || 'N/A'}</td>
                          <td>{c.tags?.join(', ') || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p>No cases found in this curriculum file, or file is empty/invalid.</p>}
              </div>
            ) : (
              !isLoadingDetails && <p>Select a curriculum file from the list to view its cases.</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const EvolverControlPanel = () => {
    const [status, setStatus] = useState({ status: 'idle', message: 'Fetching status...' });
    const [logs, setLogs] = useState([]);
    const [isLoadingStatus, setIsLoadingStatus] = useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [error, setError] = useState(null);

    // Optimizer options
    const [iterations, setIterations] = useState(1);
    const [runBootstrap, setRunBootstrap] = useState(false);
    const [bootstrapOnly, setBootstrapOnly] = useState(false);
    const [evalCasesPath, setEvalCasesPath] = useState('src/evalCases'); // Default from optimizer.js

    const fetchStatus = async () => {
      setIsLoadingStatus(true);
      setError(null);
      try {
        const response = await apiService.invokeTool('evolution.get_status');
        if (response.success) {
          setStatus(response.data);
        } else {
          setError(response.message || 'Failed to fetch optimizer status.');
          setStatus({ status: 'error', message: response.message });
        }
      } catch (err) {
        setError(err.message || 'An unexpected error occurred fetching status.');
        setStatus({ status: 'error', message: err.message });
      }
      setIsLoadingStatus(false);
    };

    const fetchLogs = async () => {
      setIsLoadingLogs(true);
      // setError(null); // Keep general errors, clear only log-specific if needed
      try {
        const response = await apiService.invokeTool('evolution.get_optimizer_log');
        if (response.success) {
          setLogs(response.data?.logs || []);
        } else {
          //setError(response.message || 'Failed to fetch optimizer logs.');
          alert(`Error fetching logs: ${response.message}`); // Use alert for log errors for now
          setLogs([]);
        }
      } catch (err) {
        //setError(err.message || 'An unexpected error occurred fetching logs.');
        alert(`Error fetching logs: ${err.message}`);
        setLogs([]);
      }
      setIsLoadingLogs(false);
    };

    useEffect(() => {
      fetchStatus();
      fetchLogs();
      const intervalId = setInterval(() => {
        fetchStatus();
        fetchLogs(); // Also refresh logs periodically when panel is open
      }, 5000); // Refresh status and logs every 5 seconds
      return () => clearInterval(intervalId);
    }, []);

    const handleStartOptimizer = async () => {
      setError(null);
      const options = {
        iterations: parseInt(iterations, 10) || 1,
        runBootstrap,
        bootstrapOnly,
        evalCasesPath,
      };
      try {
        const response = await apiService.invokeTool('evolution.start_optimizer', { options });
        if (response.success) {
          alert(response.message || 'Optimizer started successfully.');
          fetchStatus(); // Refresh status immediately
        } else {
          setError(response.message || 'Failed to start optimizer.');
        }
      } catch (err) {
        setError(err.message || 'An unexpected error occurred while starting optimizer.');
      }
    };

    const handleStopOptimizer = async () => {
      setError(null);
      try {
        const response = await apiService.invokeTool('evolution.stop_optimizer');
        if (response.success) {
          alert(response.message || 'Optimizer stop signal sent.');
          fetchStatus(); // Refresh status
        } else {
          setError(response.message || 'Failed to stop optimizer.');
        }
      } catch (err) {
        setError(err.message || 'An unexpected error occurred while stopping optimizer.');
      }
    };

    const isOptimizerRunning = status?.status === 'running';

    return (
      <div>
        <h4>Evolver Control Panel</h4>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}

        <div>
          <h5>Status: {isLoadingStatus ? 'Loading...' : `${status.status} (PID: ${status.pid || 'N/A'})`}</h5>
          <p>{status.message}</p>
          <button onClick={fetchStatus} disabled={isLoadingStatus}>Refresh Status</button>
        </div>
        <hr />
        <div>
          <h5>Controls</h5>
          <label>Iterations: <input type="number" value={iterations} onChange={e => setIterations(e.target.value)} min="1" disabled={isOptimizerRunning} /></label><br/>
          <label><input type="checkbox" checked={runBootstrap} onChange={e => setRunBootstrap(e.target.checked)} disabled={isOptimizerRunning || bootstrapOnly} /> Run Bootstrap Before Iterations</label><br/>
          <label><input type="checkbox" checked={bootstrapOnly} onChange={e => { setBootstrapOnly(e.target.checked); if(e.target.checked) setRunBootstrap(true); }} disabled={isOptimizerRunning} /> Bootstrap Only (implies Run Bootstrap)</label><br/>
          <label>Eval Cases Path: <input type="text" value={evalCasesPath} onChange={e => setEvalCasesPath(e.target.value)} disabled={isOptimizerRunning} /></label><br/>

          <button onClick={handleStartOptimizer} disabled={isOptimizerRunning || isLoadingStatus}>Start Optimizer</button>
          <button onClick={handleStopOptimizer} disabled={!isOptimizerRunning || isLoadingStatus}>Stop Optimizer</button>
        </div>
        <hr />
        <div>
          <h5>Optimizer Logs</h5>
          <button onClick={fetchLogs} disabled={isLoadingLogs}>Refresh Logs</button>
          <pre style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px', background: '#f0f0f0' }}>
            {logs.length > 0 ? logs.map(log => `[${new Date(log.timestamp).toLocaleTimeString()}] [${log.type}] ${log.message}`).join('\n') : 'No logs available or fetched yet.'}
          </pre>
        </div>
      </div>
    );
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
      <h2>MCR System Analysis Mode</h2>
      <nav className="analysis-nav">
        <button onClick={() => { setSelectedStrategyIdForDeepDive(null); setCurrentAnalysisView('leaderboard');}} disabled={currentAnalysisView === 'leaderboard' && !selectedStrategyIdForDeepDive}>Leaderboard</button>
        <button onClick={() => setCurrentAnalysisView('curriculum')} disabled={currentAnalysisView === 'curriculum'}>Curriculum</button>
        <button onClick={() => setCurrentAnalysisView('evolver')} disabled={currentAnalysisView === 'evolver'}>Evolver</button>
        {/* Deep Dive is navigated to from Leaderboard, so no direct button here unless we want to show last selected */}
      </nav>
      <div className="analysis-view-content">
        {renderCurrentView()}
      </div>
    </div>
  );
};

const InteractiveSessionMode = ({ sessionId, setSessionId, activeStrategy, setActiveStrategy, currentKb, setCurrentKb, connectSession, disconnectSession, isConnected, addMessageToHistory, chatHistory, fetchActiveStrategy, fetchCurrentKb }) => {
  // This component now receives setActiveStrategy and setCurrentKb to allow LeftSidebar to update App's state
  return (
    <div className="app-container">
      <LeftSidebar
        sessionId={sessionId}
        activeStrategy={activeStrategy}
        setActiveStrategy={setActiveStrategy} // Pass down
        connectSession={connectSession}
        disconnectSession={disconnectSession}
        isConnected={isConnected}
        addMessageToHistory={addMessageToHistory} // Pass down for demos
      />
      <div className="main-interaction-wrapper">
        <MainInteraction
            sessionId={sessionId}
            isConnected={isConnected}
            addMessageToHistory={addMessageToHistory}
        />
        <div className="chat-history-pane">
            <h3>Chat History</h3>
            {chatHistory.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.type} ${msg.isDemo ? 'demo-message' : ''} ${msg.demoLevel ? `demo-log-${msg.demoLevel}` : ''}`}>
                {msg.type === 'user' && <strong>User: {msg.text}</strong>}
                {msg.type === 'system' && <em>System: {msg.text}</em>}
                {msg.type === 'mcr' && !msg.isDemo && ( // Regular MCR response
                  <div>
                    <p><strong>MCR:</strong> {msg.response?.answer || msg.response?.message || JSON.stringify(msg.response)}</p>
                    {msg.response && (
                      <details>
                        <summary>Details</summary>
                        <pre>{JSON.stringify(msg.response, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                )}
                {msg.isDemo && msg.type === 'mcr' && ( // Demo messages from MCR tool
                  <div>
                    <p><strong>Demo ({msg.demoPayload?.demoId || 'Run'}):</strong></p>
                    {msg.demoPayload?.messages?.map((demoMsg, demoIdx) => (
                      <div key={demoIdx} className={`demo-log-item demo-log-${demoMsg.level || 'info'}`}>
                        <em>{demoMsg.level || 'log'}:</em> {demoMsg.message}
                        {demoMsg.details && <pre style={{ fontSize: '0.8em', marginLeft: '10px' }}>{JSON.stringify(demoMsg.details, null, 2)}</pre>}
                      </div>
                    ))}
                    {msg.response && msg.response.success === false && ( // If the demo tool itself failed
                       <p style={{color: 'red'}}><strong>Demo Tool Error:</strong> {msg.response.message}</p>
                    )}
                  </div>
                )}
                 {msg.isDemo && msg.type === 'demo_log' && ( // Individual demo log line
                  <div className={`demo-log-item demo-log-${msg.level || 'info'}`}>
                    <em>Demo ({msg.level || 'log'}):</em> {msg.text}
                    {msg.details && <pre style={{ fontSize: '0.8em', marginLeft: '10px' }}>{JSON.stringify(msg.details, null, 2)}</pre>}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>
      <RightSidebar knowledgeBase={currentKb} isConnected={isConnected} />
    </div>
  );
};


// --- Child Components of InteractiveSessionMode ---
const LeftSidebar = ({ sessionId, activeStrategy, setActiveStrategy, connectSession, disconnectSession, isConnected, addMessageToHistory }) => {
  const [ontologies, setOntologies] = useState([]);
  const [demos, setDemos] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [tempSessionId, setTempSessionId] = useState(sessionId || '');

  useEffect(() => {
    setTempSessionId(sessionId || '');
    if (isConnected) { // Auto-list demos if connected
      handleListDemos();
    } else {
      setDemos([]); // Clear demos if not connected
    }
  }, [sessionId, isConnected]);

  const handleConnect = () => {
    if (tempSessionId.trim()) {
      connectSession(tempSessionId.trim());
    } else {
      connectSession();
    }
  };

  const handleListDemos = async () => {
    if (!isConnected) { alert("Connect to a session first."); return; }
    try {
      const response = await apiService.invokeTool('demo.list');
      if (response.success) {
        setDemos(response.data || []);
      } else {
        alert(`Error listing demos: ${response.message || 'Unknown error'}`);
        setDemos([]);
      }
    } catch (error) {
      alert(`Error: ${error.message || 'Failed to list demos'}`);
      setDemos([]);
    }
  };

  const handleRunDemo = async (demoId) => {
    if (!isConnected || !sessionId) { alert("Connect to a session first."); return; }
    addMessageToHistory({ type: 'system', text: `Attempting to run demo: ${demoId}...` });
    try {
      const response = await apiService.invokeTool('demo.run', { demoId, sessionId });
      // Add a single message that contains all demo log lines, to be processed by chat history rendering
      addMessageToHistory({
        type: 'mcr', // Or a new type like 'demo_result'
        isDemo: true,
        demoPayload: response.data, // This will contain { demoId, messages: capturedLogs }
        response: response, // Include the whole response for success/error status of the tool itself
      });
      if (response.success) {
        // The kb_updated message should refresh the KB if the demo changed it.
        // We might also want to explicitly refresh KB after a demo.
        // For now, rely on kb_updated or manual refresh.
      } else {
        alert(`Error running demo '${demoId}': ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error: ${error.message || `Failed to run demo ${demoId}`}`);
      addMessageToHistory({
        type: 'mcr',
        isDemo: true,
        response: { success: false, message: `Client-side error running demo ${demoId}: ${error.message}` },
      });
    }
  };

  const listOntologies = async () => {
    if (!isConnected) { alert("Connect to a session first."); return; }
    try {
      const response = await apiService.invokeTool('ontology.list', { includeRules: false });
      if (response.success) setOntologies(response.data || []);
      else alert(`Error listing ontologies: ${response.message}`);
    } catch (error) { alert(`Error: ${error.message || 'Failed to list ontologies'}`); }
  };

  const loadOntologyToSession = async (ontologyName) => {
    if (!isConnected || !sessionId) { alert("Connect to a session first."); return; }
    try {
      const ontResponse = await apiService.invokeTool('ontology.get', { name: ontologyName });
      if (ontResponse.success && ontResponse.data?.rules) {
        // This is a placeholder for how one might assert rules.
        // Requires a new tool `session.assert_rules` or similar.
        const assertInput = {
          sessionId: sessionId,
          rules: ontResponse.data.rules
        };
        const assertResponse = await apiService.invokeTool('session.assert_rules', assertInput);
        if (assertResponse.success) {
          alert(`Ontology '${ontologyName}' rules asserted successfully. KB should update.`);
          // KB will be updated via kb_updated message if server logic is correct
        } else {
          alert(`Error asserting ontology '${ontologyName}': ${assertResponse.message || 'Unknown error'}`);
        }
      } else {
        alert(`Error getting ontology rules for '${ontologyName}': ${ontResponse.message}`);
      }
    } catch (error) { alert(`Error: ${error.message || 'Failed to load ontology'}`); }
  };

  const listStrategies = async () => {
    if (!isConnected) { alert("Connect to a session first."); return; }
    try {
      const response = await apiService.invokeTool('strategy.list');
      if (response.success) setStrategies(response.data || []);
      else alert(`Error listing strategies: ${response.message}`);
    } catch (error) { alert(`Error: ${error.message || 'Failed to list strategies'}`); }
  };

  const handleSetStrategy = async (strategyId) => {
    if (!isConnected) { alert("Connect to a session first."); return; }
    try {
      const response = await apiService.invokeTool('strategy.setActive', { strategyId });
      if (response.success) {
        alert(`Strategy set to ${response.data.activeStrategyId}`);
        setActiveStrategy(response.data.activeStrategyId); // Update App's state via callback
      } else {
        alert(`Error setting strategy: ${response.message}`);
      }
    } catch (error) { alert(`Error: ${error.message || 'Failed to set strategy'}`); }
  };

  return (
    <div className="sidebar left-sidebar">
      <h3>Pane 1: Config & Context</h3>
      <div>
        <h4>Session Management</h4>
        <input type="text" value={tempSessionId} onChange={(e) => setTempSessionId(e.target.value)} placeholder="Session ID (optional)" disabled={isConnected}/>
        {!isConnected ? <button onClick={handleConnect}>Connect/Create</button> : <button onClick={disconnectSession}>Disconnect</button>}
        {isConnected && <p>Session: {sessionId}</p>}
      </div> <hr />
      <div>
        <h4>Ontologies (Global)</h4>
        <button onClick={listOntologies} disabled={!isConnected}>List Ontologies</button>
        <ul>{ontologies.map(ont => <li key={ont.id || ont.name}>{ont.name} <button onClick={() => loadOntologyToSession(ont.name)} disabled={!isConnected}>Load</button></li>)}</ul>
      </div> <hr />
      <div>
        <h4>Demos</h4>
        <button onClick={handleListDemos} disabled={!isConnected}>List Demos</button>
        {demos.length === 0 && isConnected && <p>No demos found or loaded.</p>}
        <ul>
          {demos.map(demo => (
            <li key={demo.id}>
              {demo.name} ({demo.id})
              <button onClick={() => handleRunDemo(demo.id)} disabled={!isConnected || !sessionId} style={{marginLeft: '10px'}}>Run</button>
              <p style={{fontSize: '0.8em', margin: '2px 0 5px 10px'}}>{demo.description}</p>
            </li>
          ))}
        </ul>
      </div> <hr />
      <div>
        <h4>Strategies</h4>
        <button onClick={listStrategies} disabled={!isConnected}>List Strategies</button>
        <p>Active: {activeStrategy || 'N/A'}</p>
        <ul>{strategies.map(strat => <li key={strat.id || strat.name}>{strat.name} ({strat.id}) <button onClick={() => handleSetStrategy(strat.id)} disabled={!isConnected}>Set</button></li>)}</ul>
      </div>
    </div>
  );
};

const MainInteraction = ({ sessionId, isConnected, addMessageToHistory }) => {
  const [inputText, setInputText] = useState('');
  const [interactionType, setInteractionType] = useState('query');

  const handleSubmit = async () => {
    if (!inputText.trim() || !isConnected) return;
    const toolName = interactionType === 'assert' ? 'session.assert' : 'session.query';
    const inputPayload = interactionType === 'assert'
      ? { sessionId, naturalLanguageText: inputText }
      : { sessionId, naturalLanguageQuestion: inputText, queryOptions: { trace: true, debug: true } };
    addMessageToHistory({ type: 'user', text: `(${interactionType}) ${inputText}` });
    setInputText('');
    try {
      const response = await apiService.invokeTool(toolName, inputPayload);
      addMessageToHistory({ type: 'mcr', response });
    } catch (error) {
      addMessageToHistory({ type: 'mcr', response: { success: false, message: error.message || 'Request failed', error } });
    }
  };

  return (
    <div className="main-content">
      <h3>Pane 2: Interaction (Chat REPL)</h3>
      {/* Chat history is now rendered in App by InteractiveSessionMode */}
      <div className="chat-input-area">
        <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={isConnected ? "Type assertion or query..." : "Connect session"} rows={3} disabled={!isConnected}/>
        <div>
          <select value={interactionType} onChange={(e) => setInteractionType(e.target.value)} disabled={!isConnected}>
            <option value="query">Query</option> <option value="assert">Assert</option>
          </select>
          <button onClick={handleSubmit} disabled={!isConnected || !inputText.trim()}>Send</button>
        </div>
      </div>
    </div>
  );
};

const RightSidebar = ({ knowledgeBase, isConnected }) => (
  <div className="sidebar right-sidebar">
    <h3>Pane 3: Live State Viewer</h3>
    {isConnected ? <pre>{knowledgeBase || 'KB empty/not loaded.'}</pre> : <p>Connect to session.</p>}
  </div>
);


// --- Main App Component ---
function App() {
  const [currentMode, setCurrentMode] = useState('interactive'); // 'interactive' or 'analysis'
  const [isConnected, setIsConnected] = useState(false); // WebSocket connection to API service
  const [sessionId, setSessionId] = useState(null); // Active MCR session
  const [currentKb, setCurrentKb] = useState('');
  const [activeStrategy, setActiveStrategy] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  // const [serverMessages, setServerMessages] = useState([]); // For non-request/response messages like kb_updated

  const handleServerMessage = (message) => {
    // setServerMessages(prev => [...prev, message]); // Store all for debugging if needed
    if (message.type === 'connection_ack') {
      // setIsConnected(true); // apiService.connect() promise handles this for initial connection
      // This ack is from the WS server, not necessarily meaning an MCR session is active.
      console.log("Connection ACK received from server:", message.message);
    }
    if (message.type === 'kb_updated') {
      if (message.payload?.sessionId === sessionId) {
        setCurrentKb(message.payload.fullKnowledgeBase || (message.payload.newFacts || []).join('\\n'));
        addMessageToHistory({type: 'system', text: `KB updated remotely. New facts: ${message.payload.newFacts?.join(', ')}`});
      }
    }
    // If a tool_result indicates a change in state managed by App, update it.
    if (message.type === 'tool_result' && message.payload?.success) {
        if (message.payload?.data?.activeStrategyId && message.payload?.message?.includes("strategy set to")) {
            setActiveStrategy(message.payload.data.activeStrategyId);
        }
        // If an assertion was successful, refresh KB.
        // Better: rely on kb_updated. For now, manual refresh on successful assert.
        if (sessionId && message.payload?.addedFacts && message.payload?.message?.includes("asserted")) {
            fetchCurrentKb(sessionId);
        }
    }
  };

  useEffect(() => {
    apiService.addMessageListener(handleServerMessage);
    // Auto-connect to WebSocket service on load
    apiService.connect()
      .then(() => {
        setIsConnected(true); // Indicates WebSocket service is available
        console.log("Successfully connected to WebSocket service.");
        fetchActiveStrategy(); // Fetch global active strategy once connected
      })
      .catch(err => {
        console.error("Auto-connect to WebSocket service failed:", err);
        setIsConnected(false); // Explicitly set to false if connect fails
        alert("Failed to connect to MCR WebSocket service. Please ensure the server is running.");
      });

    return () => {
      apiService.removeMessageListener(handleServerMessage);
      apiService.disconnect();
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  const connectToSession = async (sidToConnect) => {
    if (!isConnected) { // Check WebSocket service connection
        alert("WebSocket service not connected. Cannot manage sessions.");
        return;
    }
    try {
      let sessionToUse = sidToConnect;
      if (!sidToConnect) { // Create new session
        const createResponse = await apiService.invokeTool('session.create');
        if (createResponse.success && createResponse.data?.id) sessionToUse = createResponse.data.id;
        else throw new Error(createResponse.message || 'Failed to create session');
        addMessageToHistory({type: 'system', text: `New session created: ${sessionToUse}`});
      } else { // Use existing session ID
         const getResponse = await apiService.invokeTool('session.get', { sessionId: sessionToUse });
         if (!getResponse.success) throw new Error(getResponse.message || `Failed to get session ${sessionToUse}`);
         addMessageToHistory({type: 'system', text: `Connected to session: ${sessionToUse}`});
      }
      setSessionId(sessionToUse);
      // setIsConnected(true); // This now means "MCR session active" vs "WS connected"
      // For clarity, let's rename isConnected to isSessionActive and have a separate isWsConnected
      // For now, isConnected will mean "MCR session is active"
      fetchCurrentKb(sessionToUse);
      fetchActiveStrategy(); // Re-fetch active strategy (might be session-specific in future)
    } catch (error) {
      alert(`Error with session: ${error.message}`);
      setSessionId(null);
    }
  };

  const disconnectFromSession = () => {
    addMessageToHistory({type: 'system', text: `UI disconnected from session: ${sessionId}`});
    setSessionId(null); // Mark MCR session as inactive
    setCurrentKb('');
    setChatHistory([]);
    // Note: We don't set isConnected (WebSocket service) to false here.
    // That stays true if the underlying WebSocket is still open.
  };

  const fetchCurrentKb = async (sid) => {
    if (!sid || !isConnected) return;
    try {
      const response = await apiService.invokeTool('session.get', { sessionId: sid });
      if (response.success && response.data) {
        setCurrentKb(response.data.facts || 'KB data not found in session object.');
      } else {
        setCurrentKb('Failed to load KB.');
      }
    } catch (error) { setCurrentKb(`Error loading KB: ${error.message}`); }
  };

  const fetchActiveStrategy = async () => {
    if (!isConnected) return; // Check WebSocket service connection
    try {
        const response = await apiService.invokeTool('strategy.getActive');
        if(response.success && response.data?.activeStrategyId) setActiveStrategy(response.data.activeStrategyId);
        else setActiveStrategy('N/A (error)');
    } catch (error) { setActiveStrategy(`Error fetching strategy: ${error.message}`); }
  };

  const addMessageToHistory = (message) => {
    setChatHistory(prev => [...prev, message]);
  };

  return (
    <>
      <div className="app-mode-switcher">
        <button onClick={() => setCurrentMode('interactive')} disabled={currentMode === 'interactive'}>Interactive Session</button>
        <button onClick={() => setCurrentMode('analysis')} disabled={currentMode === 'analysis'}>System Analysis</button>
      </div>
      {currentMode === 'interactive' ? (
        <InteractiveSessionMode
          sessionId={sessionId}
          setSessionId={setSessionId} // Though connect/disconnect manage it
          activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy} // Pass callback to update App's state
          currentKb={currentKb}
          setCurrentKb={setCurrentKb} // Pass callback
          connectSession={connectToSession}
          disconnectSession={disconnectFromSession}
          isConnected={!!sessionId} // Interactive mode's "isConnected" means session is active
          addMessageToHistory={addMessageToHistory}
          chatHistory={chatHistory}
          fetchActiveStrategy={fetchActiveStrategy}
          fetchCurrentKb={fetchCurrentKb}
        />
      ) : (
        <SystemAnalysisMode />
      )}
    </>
  );
}

export default App;
