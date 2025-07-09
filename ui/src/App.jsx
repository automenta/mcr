import React, { useState, useEffect } from 'react';
import './App.css'; // Using App.css for main layout styles
import apiService from './apiService';

// --- Mode Components ---
// SystemAnalysisMode and its sub-components will be created later
const SystemAnalysisMode = () => {
  // For now, a placeholder. Will have its own navigation for sub-views.
  const [currentAnalysisView, setCurrentAnalysisView] = useState('leaderboard'); // 'leaderboard', 'deepDive', 'curriculum', 'evolver'

  // Placeholder components for sub-views
  const StrategyLeaderboard = () => {
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
                  {/* TODO: Add button/link to navigate to StrategyDeepDive view */}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  };
  const StrategyDeepDive = () => <div><h4>Strategy Deep Dive View (TODO)</h4></div>;
  const CurriculumExplorer = () => <div><h4>Curriculum Explorer View (TODO)</h4></div>;
  const EvolverControlPanel = () => <div><h4>Evolver Control Panel View (TODO)</h4></div>;

  return (
    <div className="system-analysis-mode">
      <h2>MCR System Analysis Mode</h2>
      <nav className="analysis-nav">
        <button onClick={() => setCurrentAnalysisView('leaderboard')} disabled={currentAnalysisView === 'leaderboard'}>Leaderboard</button>
        <button onClick={() => setCurrentAnalysisView('deepDive')} disabled={currentAnalysisView === 'deepDive'}>Deep Dive</button>
        <button onClick={() => setCurrentAnalysisView('curriculum')} disabled={currentAnalysisView === 'curriculum'}>Curriculum</button>
        <button onClick={() => setCurrentAnalysisView('evolver')} disabled={currentAnalysisView === 'evolver'}>Evolver</button>
      </nav>
      <div className="analysis-view-content">
        {currentAnalysisView === 'leaderboard' && <StrategyLeaderboard />}
        {currentAnalysisView === 'deepDive' && <StrategyDeepDive />}
        {currentAnalysisView === 'curriculum' && <CurriculumExplorer />}
        {currentAnalysisView === 'evolver' && <EvolverControlPanel />}
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
              <div key={index} className={`chat-message ${msg.type}`}>
                {msg.type === 'user' && <strong>User: {msg.text}</strong>}
                {msg.type === 'system' && <em>System: {msg.text}</em>}
                {msg.type === 'mcr' && (
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
              </div>
            ))}
        </div>
      </div>
      <RightSidebar knowledgeBase={currentKb} isConnected={isConnected} />
    </div>
  );
};


// --- Child Components of InteractiveSessionMode ---
const LeftSidebar = ({ sessionId, activeStrategy, setActiveStrategy, connectSession, disconnectSession, isConnected }) => {
  const [ontologies, setOntologies] = useState([]);
  // Demos state would be here
  const [strategies, setStrategies] = useState([]);
  const [tempSessionId, setTempSessionId] = useState(sessionId || '');

  useEffect(() => {
    setTempSessionId(sessionId || '');
  }, [sessionId]);

  const handleConnect = () => {
    if (tempSessionId.trim()) {
      connectSession(tempSessionId.trim());
    } else {
      connectSession();
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
        <ul>{ontologies.map(ont => <li key={ont.name || ont.id}>{ont.name} <button onClick={() => loadOntologyToSession(ont.name)} disabled={!isConnected}>Load</button></li>)}</ul>
      </div> <hr />
      <div><h4>Demos</h4> <button disabled={!isConnected}>List Demos (TODO)</button></div> <hr />
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
