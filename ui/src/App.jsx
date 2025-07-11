import React, { useState, useEffect, useRef } from 'react';
import './App.css'; // Using App.css for main layout styles
import apiService from './apiService';

// CodeMirror Imports
import { EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { prolog } from 'codemirror-lang-prolog';

// --- Helper Component for Prolog Code in Chat ---
// Displays read-only Prolog code with syntax highlighting and an optional copy button.
const PrologCodeViewer = ({ code, title, addMessageToHistory }) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null); // To store the EditorView instance
  const [copyStatus, setCopyStatus] = useState(''); // Feedback for copy action

  useEffect(() => {
    // Initialize CodeMirror editor instance when the component mounts and editorRef is available.
    // This effect runs only once for each instance due to !viewRef.current condition.
    if (editorRef.current && !viewRef.current) { // Initialize only once
      const state = EditorState.create({
        doc: code, // Initial document content
        extensions: [
          EditorView.lineWrapping,
          oneDark,
          prolog(),
          EditorState.readOnly.of(true),
          EditorView.theme({
            "&": {
              maxHeight: "200px",
              fontSize: "0.85em",
              border: "1px solid #30363d",
              borderRadius: "4px",
              position: "relative", // For positioning copy button
            },
            ".cm-scroller": { overflow: "auto" },
          })
        ],
      });
      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view;
    }
  }, [code]); // Reruns if the code prop changes, ensuring new instances get the new code.

  // Handles copying the displayed code to the clipboard.
  const handleCopyCode = () => {
    if (navigator.clipboard && code) {
      navigator.clipboard.writeText(code)
        .then(() => {
          setCopyStatus('Copied!');
          setTimeout(() => setCopyStatus(''), 1500); // Reset status after a short delay
          // Optionally log to main chat history (currently disabled to reduce noise)
          if (addMessageToHistory) {
            // addMessageToHistory({ type: 'system', text: `📋 '${title || 'Prolog code'}' copied to clipboard.`});
          }
        })
        .catch(err => {
          setCopyStatus('Failed!');
          setTimeout(() => setCopyStatus(''), 1500);
          console.error(`Failed to copy ${title || 'Prolog code'}:`, err);
           if (addMessageToHistory) {
            // addMessageToHistory({ type: 'system', text: `❌ Error copying '${title || 'Prolog code'}'.`});
           }
        });
    }
  };

  return (
    <div style={{ marginTop: '5px', marginBottom: '5px', position: 'relative' /* Parent for absolute positioning of copy button */ }}>
      {/* Container for title and copy button, displayed above the code editor */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        {title && <p style={{ fontSize: '0.9em', color: '#8b949e' }}>{title}:</p>}
        <button
          onClick={handleCopyCode}
          title={`Copy ${title || 'Prolog code'}`}
          style={{
            background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9',
            padding: '2px 6px', fontSize: '0.75em', borderRadius: '3px', cursor: 'pointer',
            // position: 'absolute', top: '-2px', right: '0px', // Alternative positioning
          }}
        >
          {copyStatus || '📋 Copy'}
        </button>
      </div>
      <div ref={editorRef}></div>
    </div>
  );
};


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
        <h4>🏆 Strategy Leaderboard</h4>
        <button onClick={fetchLeaderboard} disabled={isLoading}>
          {isLoading ? 'Loading...' : '🔄 Refresh Leaderboard'}
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
                    <button onClick={() => onSelectStrategy(row.strategyId)}>👁️ Details</button>
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
        <button onClick={onBack} style={{marginBottom: '15px'}}>⬅️ Back to Leaderboard</button>
        <h3>🎯 Strategy Deep Dive: {details.definition?.name || strategyId}</h3>
        <p><strong>ID:</strong> {details.strategyId}</p>
        <p><strong>Hash:</strong> {details.hash}</p>

        <h4>📊 Summary Statistics</h4>
        <pre>{JSON.stringify(details.summary, null, 2)}</pre>

        <h4>📜 Definition</h4>
        <details>
          <summary>View Strategy JSON Definition</summary>
          <pre style={{maxHeight: '300px', overflow:'auto', border:'1px solid #ccc', padding:'10px', background:'#f9f9f9'}}>
            {JSON.stringify(details.definition, null, 2)}
          </pre>
        </details>

        <h4>📈 Performance Runs ({details.runs?.length || 0})</h4>
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
        <h4>🎓 Curriculum Explorer</h4>
        {isLoadingList && <p>Loading curricula list...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}

        <div style={{ display: 'flex', maxHeight: '80vh' }}>
          <div style={{ width: '30%', borderRight: '1px solid #ccc', paddingRight: '10px', overflowY: 'auto' }}>
            <h5>📚 Available Curricula</h5>
            <button onClick={fetchCurriculaList} disabled={isLoadingList}>🔄 Refresh List</button>
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
                <h5>🧪 Cases from: {selectedCurriculum.name}</h5>
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
        <h4>🧬 Evolver Control Panel</h4>
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}

        <div>
          <h5>ℹ️ Status: {isLoadingStatus ? 'Loading...' : `${status.status} (PID: ${status.pid || 'N/A'})`}</h5>
          <p>{status.message}</p>
          <button onClick={fetchStatus} disabled={isLoadingStatus}>🔄 Refresh Status</button>
        </div>
        <hr />
        <div>
          <h5>⚙️ Controls</h5>
          <label>Iterations: <input type="number" value={iterations} onChange={e => setIterations(e.target.value)} min="1" disabled={isOptimizerRunning} /></label><br/>
          <label><input type="checkbox" checked={runBootstrap} onChange={e => setRunBootstrap(e.target.checked)} disabled={isOptimizerRunning || bootstrapOnly} /> Run Bootstrap Before Iterations</label><br/>
          <label><input type="checkbox" checked={bootstrapOnly} onChange={e => { setBootstrapOnly(e.target.checked); if(e.target.checked) setRunBootstrap(true); }} disabled={isOptimizerRunning} /> Bootstrap Only (implies Run Bootstrap)</label><br/>
          <label>Eval Cases Path: <input type="text" value={evalCasesPath} onChange={e => setEvalCasesPath(e.target.value)} disabled={isOptimizerRunning} /></label><br/>

          <button onClick={handleStartOptimizer} disabled={isOptimizerRunning || isLoadingStatus}>▶️ Start Optimizer</button>
          <button onClick={handleStopOptimizer} disabled={!isOptimizerRunning || isLoadingStatus}>⏹️ Stop Optimizer</button>
        </div>
        <hr />
        <div>
          <h5>📜 Optimizer Logs</h5>
          <button onClick={fetchLogs} disabled={isLoadingLogs}>🔄 Refresh Logs</button>
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

const InteractiveSessionMode = ({ sessionId, setSessionId, activeStrategy, setActiveStrategy, currentKb, setCurrentKb, connectSession, disconnectSession, isMcrSessionActive, isWsServiceConnected, addMessageToHistory, chatHistory, fetchActiveStrategy, fetchCurrentKb }) => {
  // This component now receives setActiveStrategy and setCurrentKb to allow LeftSidebar to update App's state
  return (
    <div className="app-container">
      <LeftSidebar
        sessionId={sessionId}
        activeStrategy={activeStrategy}
        setActiveStrategy={setActiveStrategy} // Pass down
        connectSession={connectSession}
        disconnectSession={disconnectSession}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected} // Pass down
        addMessageToHistory={addMessageToHistory} // Pass down for demos
      />
      <MainInteraction
          sessionId={sessionId}
          isMcrSessionActive={isMcrSessionActive}
          addMessageToHistory={addMessageToHistory}
          chatHistory={chatHistory} // Pass chatHistory to MainInteraction
      />
      <RightSidebar
        knowledgeBase={currentKb}
        isMcrSessionActive={isMcrSessionActive}
        sessionId={sessionId}
        fetchCurrentKb={fetchCurrentKb}
        addMessageToHistory={addMessageToHistory}
        setCurrentKb={setCurrentKb} // Pass down setCurrentKb
      />
    </div>
  );
};


// --- Modal Component ---
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        backgroundColor: '#161b22', padding: '20px', borderRadius: '8px',
        minWidth: '400px', maxWidth: '80vw', maxHeight: '80vh',
        border: '1px solid #30363d', display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, color: '#58a6ff' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#c9d1d9', fontSize: '1.5em', cursor: 'pointer' }}>&times;</button>
        </div>
        <div style={{ overflowY: 'auto', flexGrow: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Direct KB Assertion Component ---
// Component for directly asserting Prolog facts/rules to the Knowledge Base.
// Found in the LeftSidebar.
const DirectAssertionEditor = ({ sessionId, isMcrSessionActive, isWsServiceConnected, addMessageToHistory }) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null); // Stores the CodeMirror EditorView instance
  const [prologCode, setPrologCode] = useState(''); // Current Prolog code in the editor
  const [assertionStatus, setAssertionStatus] = useState({ message: '', type: '' }); // For local feedback (e.g., success/error message)

  useEffect(() => {
    // Initialize CodeMirror editor for Prolog input.
    if (editorRef.current && !viewRef.current) {
      const state = EditorState.create({
        doc: prologCode,
        extensions: [
          basicSetup, // Includes line numbers, history, etc.
          EditorView.lineWrapping,
          oneDark,
          prolog(),
          EditorView.theme({
            "&": {
              minHeight: "100px",
              maxHeight: "200px",
              fontSize: "0.9em",
              border: "1px solid #30363d",
              borderRadius: "4px",
            },
            ".cm-scroller": { overflow: "auto" },
          }),
          // Listener to update React state from CodeMirror state (optional if controlled by CM)
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              setPrologCode(update.state.doc.toString());
            }
          })
        ],
      });
      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view;
    }
    // Basic cleanup if component unmounts, though full cleanup is tricky with CM6 + StrictMode
    return () => {
        // if (viewRef.current) { viewRef.current.destroy(); viewRef.current = null; }
    };
  }, []); // Initialize CodeMirror once when the component mounts.

  // Handles the submission of Prolog code to be asserted to the knowledge base.
  const handleAssertToKb = async () => {
    setAssertionStatus({ message: '', type: '' }); // Clear previous status before new assertion.

    // Basic validation checks.
    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) {
      const errorMsg = '⚠️ Cannot assert: No active MCR session or WebSocket connection.';
      addMessageToHistory({ type: 'system', text: errorMsg }); // Log to main chat.
      setAssertionStatus({ message: errorMsg, type: 'error' }); // Show local feedback.
      return;
    }
    if (!prologCode.trim()) {
      const errorMsg = '⚠️ Cannot assert: Prolog code is empty.';
      addMessageToHistory({ type: 'system', text: errorMsg });
      setAssertionStatus({ message: errorMsg, type: 'error' });
      return;
    }

    const systemMessage = `✏️ Asserting to KB via Direct Editor: \n${prologCode}`;
    addMessageToHistory({ type: 'system', text: systemMessage }); // Inform user via main chat.
    setAssertionStatus({ message: 'Asserting...', type: 'info' }); // Local feedback: in progress.

    try {
      // Invoke backend tool to assert rules.
      const response = await apiService.invokeTool('session.assert_rules', {
        sessionId: sessionId,
        rules: prologCode, // Send content as a single string of rules.
      });

      if (response.success) {
        const successMsg = '✅ Prolog asserted successfully. KB updated.';
        addMessageToHistory({ type: 'system', text: successMsg });
        setAssertionStatus({ message: successMsg, type: 'success' });
        // Clear the editor content on successful assertion.
        if (viewRef.current) {
          viewRef.current.dispatch({
            changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' }
          });
        }
        setPrologCode(''); // Also clear the React state backing the editor.
      } else {
        // Handle assertion failure reported by the backend.
        const errorMsg = `❌ Error asserting Prolog: ${response.message || response.error || 'Unknown error'}`;
        addMessageToHistory({ type: 'system', text: errorMsg });
        setAssertionStatus({ message: errorMsg, type: 'error' });
      }
    } catch (error) {
      // Handle exceptions during the API call.
      const errorMsg = `❌ Exception asserting Prolog: ${error.message}`;
      addMessageToHistory({ type: 'system', text: errorMsg });
      setAssertionStatus({ message: errorMsg, type: 'error' });
      console.error("Exception asserting Prolog:", error);
    }
  };

  return (
    <div>
      <h4>✏️ Direct KB Assertion</h4>
      <p className="text-muted" style={{fontSize: '0.8em', marginBottom: '5px'}}>Enter Prolog facts or rules (e.g., <code>father(john,pete).</code>). Each statement must end with a period.</p>
      <div ref={editorRef} style={{marginBottom: '10px'}}></div> {/* CodeMirror editor container */}
      <button
        onClick={handleAssertToKb}
        disabled={!isMcrSessionActive || !isWsServiceConnected || !prologCode.trim()}
        title="Assert the entered Prolog code to the current session's Knowledge Base"
      >
        ⚡ Assert to KB
      </button>
      {/* Display local status message for the assertion operation */}
      {assertionStatus.message && (
        <p style={{
          fontSize: '0.8em',
          marginTop: '5px',
          padding: '5px',
          borderRadius: '3px',
          backgroundColor: assertionStatus.type === 'error' ? 'rgba(248, 81, 73, 0.2)' :
                             assertionStatus.type === 'success' ? 'rgba(63, 185, 80, 0.2)' :
                             'rgba(88, 166, 255, 0.1)',
          color: assertionStatus.type === 'error' ? '#ff817a' :
                 assertionStatus.type === 'success' ? '#3fb950' :
                 '#58a6ff'
        }}>
          {assertionStatus.message}
        </p>
      )}
    </div>
  );
};


// --- Child Components of InteractiveSessionMode ---
const LeftSidebar = ({ sessionId, activeStrategy, setActiveStrategy, connectSession, disconnectSession, isMcrSessionActive, isWsServiceConnected, addMessageToHistory }) => {
  const [ontologies, setOntologies] = useState([]);
  const [demos, setDemos] = useState([]);
  const [strategies, setStrategies] = useState([]); // Add emojis to titles in return()
  const [tempSessionId, setTempSessionId] = useState(sessionId || '');

  // State for Modals
  const [isOntologyModalOpen, setIsOntologyModalOpen] = useState(false);
  const [selectedOntologyContent, setSelectedOntologyContent] = useState({ name: '', rules: '' });
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [selectedStrategyContent, setSelectedStrategyContent] = useState({ name: '', description: '', definition: null }); // definition could be full JSON if API supports


  useEffect(() => {
    setTempSessionId(sessionId || '');
    if (isMcrSessionActive) {
      // Fetch lists when session becomes active
      listOntologies();
      listStrategies();
      handleListDemos();
    } else {
      setDemos([]);
      setOntologies([]);
      setStrategies([]);
    }
  }, [sessionId, isMcrSessionActive]);

  const handleConnect = () => {
    // connectSession internally checks for isWsServiceConnected
    if (tempSessionId.trim()) {
      connectSession(tempSessionId.trim());
    } else {
      connectSession();
    }
  };

  const handleListDemos = async () => {
    if (!isMcrSessionActive || !isWsServiceConnected) { alert("Connect to a session and ensure WebSocket is active first."); return; }
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
    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) { alert("Connect to a session and ensure WebSocket is active first."); return; }
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
    if (!isMcrSessionActive || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: 'Session not active. Cannot list ontologies.'}); return; }
    try {
      const response = await apiService.invokeTool('ontology.list', { includeRules: false }); // includeRules: false is fine for listing
      if (response.success) setOntologies(response.data || []);
      else addMessageToHistory({type: 'system', text: `Error listing ontologies: ${response.message}`});
    } catch (error) { addMessageToHistory({type: 'system', text: `Error: ${error.message || 'Failed to list ontologies'}`});}
  };

  const viewOntology = async (ontologyName) => {
    if (!isMcrSessionActive || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: 'Session not active. Cannot view ontology.'}); return; }
    try {
      // Fetch with rules for viewing
      const response = await apiService.invokeTool('ontology.get', { name: ontologyName, includeRules: true });
      if (response.success && response.data) {
        setSelectedOntologyContent({ name: response.data.name, rules: response.data.rules || "// No rules defined or an error occurred." });
        setIsOntologyModalOpen(true);
      } else {
        addMessageToHistory({type: 'system', text: `Error fetching ontology '${ontologyName}': ${response.message}`});
      }
    } catch (error) { addMessageToHistory({type: 'system', text: `Error: ${error.message || `Failed to fetch ontology ${ontologyName}`}`});}
  };

  const loadOntologyToSession = async (ontologyName) => {
    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: 'Session not active. Cannot load ontology.'}); return; }
    try {
      const ontResponse = await apiService.invokeTool('ontology.get', { name: ontologyName, includeRules: true });
      if (ontResponse.success && ontResponse.data?.rules) {
        const assertInput = {
          sessionId: sessionId,
          rules: ontResponse.data.rules
        };
        const assertResponse = await apiService.invokeTool('session.assert_rules', assertInput);
        if (assertResponse.success) {
          addMessageToHistory({type: 'system', text: `Ontology '${ontologyName}' rules asserted successfully. KB updated.`});
        } else {
          addMessageToHistory({type: 'system', text: `Error asserting ontology '${ontologyName}': ${assertResponse.message || 'Unknown error'}`});
        }
      } else {
        addMessageToHistory({type: 'system', text: `Error getting ontology rules for '${ontologyName}': ${ontResponse.message}`});
      }
    } catch (error) { addMessageToHistory({type: 'system', text: `Error: ${error.message || 'Failed to load ontology'}`});}
  };

  const listStrategies = async () => {
    if (!isMcrSessionActive || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: 'Session not active. Cannot list strategies.'}); return; }
    try {
      const response = await apiService.invokeTool('strategy.list');
      if (response.success) setStrategies(response.data || []);
      else addMessageToHistory({type: 'system', text: `Error listing strategies: ${response.message}`});
    } catch (error) { addMessageToHistory({type: 'system', text: `Error: ${error.message || 'Failed to list strategies'}`});}
  };

  const viewStrategy = (strategy) => {
    // For now, just shows name and description.
    // If API provided full JSON definition via strategy.get, we'd fetch and show that.
    setSelectedStrategyContent({ name: strategy.name, description: strategy.description, definition: strategy.definition /* if available */ });
    setIsStrategyModalOpen(true);
  };

  const handleSetStrategy = async (strategyId) => {
    if (!isMcrSessionActive || !isWsServiceConnected) { alert("Connect to a session and ensure WebSocket is active first."); return; }
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
      <h3>⚙️ Config & Context</h3>
      <div>
        <h4>🔌 Session Management</h4>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: '0.5rem'}}>
            <input type="text" value={tempSessionId} onChange={(e) => setTempSessionId(e.target.value)} placeholder="Session ID (optional)" disabled={isMcrSessionActive || !isWsServiceConnected} style={{flexGrow: 1, marginRight: '5px'}}/>
            {!isMcrSessionActive ?
              <button onClick={handleConnect} disabled={!isWsServiceConnected} title="Connect or Create Session">✅ Connect</button> :
              <button onClick={disconnectSession} disabled={!isWsServiceConnected} title="Disconnect Session">❌ Disconnect</button>
            }
        </div>
        {isMcrSessionActive && <p className="text-muted">Active Session: {sessionId}</p>}
      </div> <hr />

      <div>
        <h4>📚 Ontologies</h4>
        <button onClick={listOntologies} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Refresh Ontology List">🔄 List</button>
        {ontologies.length === 0 && isMcrSessionActive && <p className="text-muted" style={{marginTop:'5px'}}>No ontologies loaded or found.</p>}
        <ul>{ontologies.map(ont => (
          <li key={ont.id || ont.name} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>{ont.name}</span>
            <div>
              <button onClick={() => viewOntology(ont.name)} disabled={!isMcrSessionActive || !isWsServiceConnected} title="View Ontology Rules">👁️ View</button>
              <button onClick={() => loadOntologyToSession(ont.name)} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Load Ontology into Session" style={{marginLeft:'5px'}}>➕ Load</button>
            </div>
          </li>
        ))}</ul>
      </div> <hr />

      <div>
        <h4>🚀 Demos</h4>
        <button onClick={handleListDemos} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Refresh Demo List">🔄 List</button>
        {demos.length === 0 && isMcrSessionActive && <p className="text-muted" style={{marginTop:'5px'}}>No demos found or loaded.</p>}
        <ul>
          {demos.map(demo => (
            <li key={demo.id}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span>{demo.name} <small>({demo.id})</small></span>
                <button onClick={() => handleRunDemo(demo.id)} disabled={!isMcrSessionActive || !sessionId || !isWsServiceConnected} title="Run Demo">▶️ Run</button>
              </div>
              {demo.description && <small className="text-muted" style={{paddingLeft: '10px'}}>{demo.description}</small>}
            </li>
          ))}
        </ul>
      </div> <hr />

      <div>
        <h4>🛠️ Strategies</h4>
        <button onClick={listStrategies} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Refresh Strategy List">🔄 List</button>
        <p className="text-muted" style={{marginTop:'5px'}}>Active: <strong style={{color: '#58a6ff'}}>{activeStrategy || 'N/A'}</strong></p>
        {strategies.length === 0 && isMcrSessionActive && <p className="text-muted">No strategies loaded or found.</p>}
        <ul>{strategies.map(strat => (
          <li key={strat.id || strat.name}
              className={`strategy-item ${activeStrategy === strat.id ? 'active-strategy' : ''}`}
              style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>{strat.name} <small>({strat.id})</small></span>
            <div>
              <button onClick={() => viewStrategy(strat)} disabled={!isMcrSessionActive || !isWsServiceConnected} title="View Strategy Details">👁️ View</button>
              <button onClick={() => handleSetStrategy(strat.id)} disabled={!isMcrSessionActive || !isWsServiceConnected || activeStrategy === strat.id} title="Set as Active Strategy" style={{marginLeft:'5px'}}>
                {activeStrategy === strat.id ? 'Active' : '✅ Set'}
              </button>
            </div>
          </li>
        ))}</ul>
      </div>

      <Modal isOpen={isOntologyModalOpen} onClose={() => setIsOntologyModalOpen(false)} title={`Ontology: ${selectedOntologyContent.name}`}>
        <PrologCodeViewer code={selectedOntologyContent.rules} title={selectedOntologyContent.name} addMessageToHistory={addMessageToHistory} />
      </Modal>

      <Modal isOpen={isStrategyModalOpen} onClose={() => setIsStrategyModalOpen(false)} title={`Strategy: ${selectedStrategyContent.name}`}>
        <p><strong>Description:</strong></p>
        <p style={{whiteSpace: 'pre-wrap', marginBottom: '15px'}}>{selectedStrategyContent.description || "No description available."}</p>
        {selectedStrategyContent.definition ? (
          <>
            <p><strong>Definition (JSON):</strong></p>
            <pre style={{maxHeight: '40vh', overflow: 'auto', background: '#0d1117', border: '1px solid #30363d', padding: '10px', borderRadius: '4px'}}>
              {JSON.stringify(selectedStrategyContent.definition, null, 2)}
            </pre>
          </>
        ) : (
          <p className="text-muted">Full JSON definition not available for display.</p>
        )}
      </Modal>
      <hr />
      <DirectAssertionEditor
        sessionId={sessionId}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
        addMessageToHistory={addMessageToHistory}
      />
    </div>
  );
};

const MainInteraction = ({ sessionId, isMcrSessionActive, addMessageToHistory, chatHistory }) => {
  const [inputText, setInputText] = useState(''); // State for the text in the input textarea
  const [interactionType, setInteractionType] = useState('query'); // State for 'query' or 'assert' selection
  const chatHistoryRef = useRef(null); // Ref for the chat history container to enable auto-scrolling

  useEffect(() => {
    // Auto-scroll to the bottom of the chat history pane when new messages are added.
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]); // Dependency: runs when chatHistory array changes.

  // Handles submission of user input (natural language query or assertion).
  const handleSubmit = async () => {
    if (!inputText.trim() || !isMcrSessionActive) return; // Basic validation.
    const toolName = interactionType === 'assert' ? 'session.assert' : 'session.query'; // Determine backend tool based on selected interaction type.
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
    <div className="main-interaction-wrapper"> {/* Renamed from main-content for clarity, or use main-content and ensure it's flex-column */}
      <h3>💬 Chat REPL</h3>
      <div className="chat-history-pane" ref={chatHistoryRef}>
        {chatHistory.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.type} ${msg.isDemo ? 'demo-message' : ''} ${msg.demoLevel ? `demo-log-${msg.demoLevel}` : ''}`}>
            {msg.type === 'user' && <strong>👤 User: {msg.text}</strong>}
            {msg.type === 'system' && <em>⚙️ System: {msg.text}</em>}

            {/* Render regular MCR (non-demo) responses */}
            {msg.type === 'mcr' && !msg.isDemo && (
              // Check if the response indicates success or failure
              msg.response?.success !== false ? (
                // Block for successful MCR responses
                <div>
                  <p><strong>🤖 MCR:</strong> {msg.response?.answer || 'Received a response.'}</p>
                  {/* Display added facts if present */}
                  {msg.response?.addedFacts && Array.isArray(msg.response.addedFacts) && msg.response.addedFacts.length > 0 && (
                    <PrologCodeViewer code={msg.response.addedFacts.join('\n')} title="Added Facts" addMessageToHistory={addMessageToHistory}/>
                  )}
                  {/* Display Prolog trace from debugInfo if present */}
                  {msg.response?.debugInfo?.prologTrace && (
                    <PrologCodeViewer code={msg.response.debugInfo.prologTrace} title="Prolog Trace" addMessageToHistory={addMessageToHistory}/>
                  )}
                  {/* Display explanation, attempting to render as Prolog if it looks like it */}
                  {msg.response?.explanation && (
                    typeof msg.response.explanation === 'string' &&
                    (msg.response.explanation.includes(":-") || msg.response.explanation.trim().endsWith(".")) &&
                    msg.response.explanation.length > 10 // Heuristic for Prolog-like string
                  ) ? (
                    <PrologCodeViewer code={msg.response.explanation} title="Explanation (Prolog)" addMessageToHistory={addMessageToHistory}/>
                  ) : msg.response?.explanation ? (
                    <div>
                        <p style={{ fontSize: '0.9em', color: '#8b949e', marginBottom: '3px' }}>Explanation:</p>
                        <p>{msg.response.explanation}</p>
                    </div>
                  ) : null}
                  {/* Collapsible section for all other raw details in the response */}
                  {msg.response && (
                    <details>
                      <summary>Raw Details</summary>
                      <pre>{JSON.stringify(
                        Object.fromEntries(
                          Object.entries(msg.response).filter(([key]) => !['answer', 'addedFacts', 'explanation', 'debugInfo', 'message', 'success'].includes(key) || (key === 'debugInfo' && !msg.response.debugInfo.prologTrace))
                        ), null, 2
                      )}</pre>
                    </details>
                  )}
                </div>
              ) : (
                // Block for MCR responses that indicate an error (success === false)
                <div>
                  <p><strong>⚠️ MCR Error:</strong> <span style={{color: '#ff817a'}}>{msg.response.message || msg.response.error || 'An unspecified error occurred.'}</span></p>
                  {/* Collapsible section for additional error details */}
                  {(msg.response.details || (msg.response.error && msg.response.message)) && (
                    <details style={{marginTop: '5px'}}>
                      <summary style={{color: '#ff817a', fontSize:'0.9em'}}>Error Details</summary>
                      <pre style={{borderColor: '#ff817a'}}>
                        {JSON.stringify(Object.fromEntries(
                          Object.entries(msg.response).filter(([key]) => !['success', 'message', 'error'].includes(key) || (key === 'error' && msg.response.message) )
                        ), null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )
            )}

            {/* Render messages from demo runs (which are also of type 'mcr' but have isDemo: true) */}
            {msg.isDemo && msg.type === 'mcr' && (
              <div>
                <p><strong>🚀 Demo ({msg.demoPayload?.demoId || 'Run'}):</strong></p>
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
                <em>🚀 Demo ({msg.level || 'log'}):</em> {msg.text}
                {msg.details && <pre style={{ fontSize: '0.8em', marginLeft: '10px' }}>{JSON.stringify(msg.details, null, 2)}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-area">
        <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={isMcrSessionActive ? "Type assertion or query... (Shift+Enter for new line)" : "Connect session"} rows={3} disabled={!isMcrSessionActive}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div>
          <select value={interactionType} onChange={(e) => setInteractionType(e.target.value)} disabled={!isMcrSessionActive}>
            <option value="query">❓ Query</option> <option value="assert">✍️ Assert</option>
          </select>
          <button onClick={handleSubmit} disabled={!isMcrSessionActive || !inputText.trim()} title="Send Message (Enter)">▶️ Send</button>
        </div>
      </div>
    </div>
  );
};

// Component for the right sidebar, primarily displaying the Knowledge Base.
// Features an editable CodeMirror instance for the KB, with save, refresh, and copy capabilities.
const RightSidebar = ({ knowledgeBase, isMcrSessionActive, sessionId, fetchCurrentKb, addMessageToHistory, setCurrentKb }) => {
  const editorRef = useRef(null); // Ref for the CodeMirror editor's parent div
  const viewRef = useRef(null); // Ref to store the CodeMirror EditorView instance
  const [copyStatus, setCopyStatus] = useState(''); // Status message for copy action (e.g., "Copied!")
  const [isDirty, setIsDirty] = useState(false); // Tracks if the editor content has changed from the last saved state or prop update
  const [editableKbContent, setEditableKbContent] = useState(knowledgeBase || ''); // Local state for the editor's content, initially from prop

  useEffect(() => {
    // This effect synchronizes the editor's content when the `knowledgeBase` prop changes.
    // This typically occurs when:
    // 1. The session is first connected, and the initial KB is loaded.
    // 2. The KB is updated remotely (e.g., by another user, a demo, or DirectAssertionEditor).
    // 3. The user clicks the "Refresh" button.
    // It updates the local `editableKbContent` state. If the CodeMirror editor is already initialized,
    // it dispatches a change to CodeMirror to update its document content.
    // Crucially, it resets the `isDirty` flag, as the editor content is now aligned with the (new) `knowledgeBase` prop.
    setEditableKbContent(knowledgeBase || ''); // Update local state
    if (viewRef.current) { // If editor is initialized
      const currentEditorDoc = viewRef.current.state.doc.toString();
      if (currentEditorDoc !== (knowledgeBase || '')) { // Only update if different
        viewRef.current.dispatch({
          changes: { from: 0, to: currentEditorDoc.length, insert: knowledgeBase || '' }
        });
      }
    }
    setIsDirty(false); // Content is now aligned with prop, so it's not "dirty" relative to the source.
  }, [knowledgeBase]); // Dependency: runs when `knowledgeBase` prop from App state changes.


  useEffect(() => {
    // Initializes the CodeMirror editor instance.
    // This effect runs when `isMcrSessionActive` becomes true and the editor hasn't been initialized yet.
    // It uses `editableKbContent` for the initial document, which should be up-to-date
    // due to the `useEffect` above that listens to `knowledgeBase` prop.
    if (editorRef.current && !viewRef.current && isMcrSessionActive) {
      const state = EditorState.create({
        doc: editableKbContent, // Initialize with current KB content.
        extensions: [
          basicSetup, // Standard CodeMirror features.
          oneDark,    // Dark theme.
          prolog(),   // Prolog language support.
          EditorView.lineWrapping, // Wrap long lines.
          // Listener to update React state when the CodeMirror document changes due to user typing.
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              setEditableKbContent(update.state.doc.toString()); // Keep React state in sync.
              setIsDirty(true); // Mark as dirty because the user has made changes.
            }
          }),
          EditorView.theme({ // Custom styling.
            "&": {
              height: "calc(100% - 75px)", // Adjust height for buttons below.
              fontSize: "0.9em",
            },
            ".cm-scroller": { overflow: "auto" },
          })
        ],
      });
      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view; // Store the CodeMirror view instance.
    }
    // Optional: Cleanup CodeMirror instance on component unmount or when session becomes inactive.
    // This might be important to prevent memory leaks if the component can be frequently mounted/unmounted
    // or to ensure a fresh editor if the session is disconnected and reconnected.
    // Example cleanup (might need adjustment based on strict mode behavior):
    // return () => {
    //   if (viewRef.current) {
    //     viewRef.current.destroy();
    //     viewRef.current = null;
    //   }
    // };
  }, [isMcrSessionActive, editableKbContent]); // Dependencies:
                                          // `isMcrSessionActive`: to trigger initialization when session starts.
                                          // `editableKbContent`: included so if it's populated *after* isMcrSessionActive becomes true
                                          // (e.g. knowledgeBase prop arrives late) but *before* this effect runs,
                                          // the editor gets the correct initial content.
                                          // Primary updates to an *existing* editor are handled by the separate [knowledgeBase] effect.

  // Copies the current content of the KB editor to the clipboard.
  const handleCopyKb = () => {
    const contentToCopy = viewRef.current ? viewRef.current.state.doc.toString() : editableKbContent;
    if (navigator.clipboard && contentToCopy) {
      navigator.clipboard.writeText(contentToCopy)
        .then(() => {
          setCopyStatus('Copied!');
          setTimeout(() => setCopyStatus(''), 2000);
          addMessageToHistory({ type: 'system', text: '📝 KB content copied to clipboard.' });
        })
        .catch(err => {
          setCopyStatus('Failed to copy.');
          console.error('Failed to copy KB:', err);
          addMessageToHistory({ type: 'system', text: `❌ Error copying KB: ${err.message}` });
        });
    }
  };

  // Refreshes the KB editor content from the server.
  // If local changes exist (isDirty), it prompts the user for confirmation.
  const handleRefreshKb = () => {
    if (sessionId && fetchCurrentKb) {
      if (isDirty) {
        if (!confirm("⚠️ You have unsaved changes in the KB editor. Refreshing will discard them. Continue?")) {
          return;
        }
      }
      fetchCurrentKb(sessionId); // This will update `knowledgeBase` prop, triggering the first useEffect.
      addMessageToHistory({ type: 'system', text: '🔄 Refreshing KB from server...' });
      // setIsDirty(false) is handled by the useEffect listening to `knowledgeBase` prop changes.
    }
  };

  // Saves the current content of the KB editor to the server.
  // Assumes a backend tool `session.set_kb` exists.
  const handleSaveChanges = async () => {
    if (!sessionId || !isMcrSessionActive || !viewRef.current) {
      addMessageToHistory({ type: 'system', text: '⚠️ Cannot save KB: No active session or editor not ready.' });
      return;
    }
    const newKbContent = viewRef.current.state.doc.toString(); // Get current content from CodeMirror.
    addMessageToHistory({ type: 'system', text: `💾 Saving KB to server...` });
    try {
      // Preferred method: Use a dedicated backend tool to set the entire KB content.
      const response = await apiService.invokeTool('session.set_kb', { sessionId, kbContent: newKbContent });

      // Alternative (if session.set_kb is not available and requires session.clear_kb + session.assert_rules):
      // const clearResponse = await apiService.invokeTool('session.clear_kb', { sessionId });
      // if (!clearResponse.success) throw new Error(`Failed to clear KB before save: ${clearResponse.message}`);
      // const response = await apiService.invokeTool('session.assert_rules', { sessionId, rules: newKbContent });

      if (response.success) {
        addMessageToHistory({ type: 'system', text: '✅ KB saved successfully.' });
        setCurrentKb(newKbContent); // Update App's main KB state directly. This will also trigger the [knowledgeBase] useEffect.
        setIsDirty(false); // Mark as no longer dirty as changes are saved.
        // Optionally, could re-fetch from server to absolutely confirm, but setCurrentKb should be sufficient
        // if the `session.set_kb` tool is reliable and the server doesn't modify content during set.
        // fetchCurrentKb(sessionId);
      } else {
        addMessageToHistory({ type: 'system', text: `❌ Error saving KB: ${response.message || 'Unknown error'}` });
      }
    } catch (error) {
      addMessageToHistory({ type: 'system', text: `❌ Exception saving KB: ${error.message}` });
      console.error("Exception saving KB:", error);
    }
  };


  return (
    <div className="sidebar right-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%'}}>
      {/* Header for the KB section, indicates if there are unsaved changes with an asterisk */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
        <h3>🧠 Knowledge Base {isDirty ? "*" : ""}</h3>
        <div>
          {/* Placeholder for potential future buttons like Load from file / Save to file */}
        </div>
      </div>
      {isMcrSessionActive ? (
        <>
          {/* CodeMirror editor container */}
          <div ref={editorRef} style={{ flexGrow: 1, overflow: 'hidden', border: '1px solid #30363d', borderRadius: '4px' }}></div>
          {/* Action buttons for the KB editor */}
          <div className="kb-actions" style={{paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <button onClick={handleSaveChanges} disabled={!isDirty || !isMcrSessionActive} title="Save changes to session KB">💾 Save KB</button>
              <button onClick={handleRefreshKb} disabled={!isMcrSessionActive} title="Refresh KB from server (discard local changes if any)" style={{marginLeft: '5px'}}>🔄 Refresh</button>
            </div>
            <div>
              <button onClick={handleCopyKb} disabled={!isMcrSessionActive || !editableKbContent} title="Copy KB content" style={{marginLeft: '5px'}}>📋 Copy</button>
              {copyStatus && <span style={{marginLeft: '10px', fontSize: '0.8em', fontStyle: 'italic'}}>{copyStatus}</span>}
            </div>
          </div>
        </>
      ) : (
        <p className="text-muted" style={{textAlign: 'center', marginTop: '20px'}}>Connect to a session to view Knowledge Base.</p>
      )}
    </div>
  );
};


// --- Main App Component ---
function App() {
  const [currentMode, setCurrentMode] = useState('interactive'); // 'interactive' or 'analysis'
  const [isConnected, setIsConnected] = useState(false); // WebSocket connection to API service
  const [sessionId, setSessionId] = useState(null); // Active MCR session
  const [currentKb, setCurrentKb] = useState('');
  const [activeStrategy, setActiveStrategy] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  // const [serverMessages, setServerMessages] = useState([]); // For non-request/response messages like kb_updated
  const [isWsServiceConnected, setIsWsServiceConnected] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState('Initializing...'); // 'Initializing...', 'Connecting...', 'Connected', 'Error', 'Disconnected'

  const handleServerMessage = (message) => {
    // setServerMessages(prev => [...prev, message]); // Store all for debugging if needed
    if (message.type === 'connection_ack') {
      console.log("Connection ACK received from server:", message.message);
      // Actual connection status is managed by the connect promise and onclose/onerror handlers in apiService
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

    // Listener for apiService's internal status changes (optional, if apiService emits them)
    const handleWsStatusChange = (status) => {
        // This would require apiService to have an event emitter for its states like 'connecting', 'connected', 'disconnected', 'error'
        // For now, we'll manage based on connect() promise and errors.
        // Example: if (status === 'connected') setIsWsServiceConnected(true);
    };
    // apiService.on('statusChange', handleWsStatusChange);

    // With apiService.connect() now resetting `explicitlyClosed`,
    // this useEffect will correctly establish a connection even in StrictMode.
    // 1. (Strict Mode) Effect runs first time: connect() called.
    // 2. (Strict Mode) Cleanup runs: disconnect() called (sets explicitlyClosed = true).
    // 3. (Strict Mode) Effect runs second time: connect() called (resets explicitlyClosed = false, connects).
    // This is the desired behavior for a persistent connection.

    setWsConnectionStatus('Connecting...');
    apiService.connect()
      .then(() => {
        setIsWsServiceConnected(true);
        setWsConnectionStatus('Connected');
        console.log("Successfully connected to WebSocket service.");
        fetchActiveStrategy(); // Fetch global active strategy once connected
      })
      .catch(err => {
        console.error("Initial auto-connect to WebSocket service failed:", err);
        setIsWsServiceConnected(false);
        // The apiService will attempt reconnections. We can reflect this in status.
        // The onclose event in apiService can also update a global status or emit an event.
        setWsConnectionStatus(`Error: ${err.message || 'Failed to connect'}. Reconnecting...`);
        // No alert here, apiService handles retries.
      });

    return () => {
      apiService.removeMessageListener(handleServerMessage);
      // apiService.off('statusChange', handleWsStatusChange); // If using an event emitter

      // This disconnect will run on component unmount.
      // In StrictMode, it will run after the first effect execution.
      // Since apiService.connect() now resets `explicitlyClosed`, the second
      // effect execution in StrictMode will correctly re-establish the connection.
      apiService.disconnect();
    };
  }, []); // Empty dependency array: runs once on mount, cleans up on unmount

  const connectToSession = async (sidToConnect) => {
    if (!isWsServiceConnected) { // Check WebSocket service connection
        alert("WebSocket service not connected. Cannot manage sessions.");
        setWsConnectionStatus('Error: WebSocket service not available');
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
      <div className="app-header">
        <div className="app-mode-switcher">
          <button onClick={() => setCurrentMode('interactive')} disabled={currentMode === 'interactive'}>Interactive Session</button>
          <button onClick={() => setCurrentMode('analysis')} disabled={currentMode === 'analysis'}>System Analysis</button>
        </div>
        <div className="ws-status">
          WebSocket: {wsConnectionStatus}
          {!isWsServiceConnected && wsConnectionStatus.startsWith('Error') && (
            <button onClick={() => {
              setWsConnectionStatus('Connecting...');
              apiService.connect().then(() => {
                setIsWsServiceConnected(true);
                setWsConnectionStatus('Connected');
                fetchActiveStrategy();
              }).catch(err => {
                setWsConnectionStatus(`Error: ${err.message || 'Failed to connect'}. Retrying...`);
                // apiService will retry automatically, but this provides immediate feedback
              });
            }} style={{marginLeft: '10px'}}>
              Retry Connect
            </button>
          )}
        </div>
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
          isMcrSessionActive={!!sessionId} // Renamed for clarity
          isWsServiceConnected={isWsServiceConnected} // Pass down WS service status
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
