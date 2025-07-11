import React, { useState, useEffect } from 'react';
import apiService from '../../apiService'; // Adjusted path
import Modal from '../Modal'; // Adjusted path
import PrologCodeViewer from '../PrologCodeViewer'; // Adjusted path
import DirectAssertionEditor from '../DirectAssertionEditor'; // Adjusted path

const LeftSidebar = ({ sessionId, activeStrategy, setActiveStrategy, connectSession, disconnectSession, isMcrSessionActive, isWsServiceConnected, addMessageToHistory }) => {
  const [ontologies, setOntologies] = useState([]);
  const [demos, setDemos] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [tempSessionId, setTempSessionId] = useState(sessionId || '');

  // State for Modals
  const [isOntologyModalOpen, setIsOntologyModalOpen] = useState(false);
  const [selectedOntologyContent, setSelectedOntologyContent] = useState({ name: '', rules: '' });
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [selectedStrategyContent, setSelectedStrategyContent] = useState({ name: '', description: '', definition: null });


  useEffect(() => {
    setTempSessionId(sessionId || '');
    if (isMcrSessionActive) {
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
    if (tempSessionId.trim()) {
      connectSession(tempSessionId.trim());
    } else {
      connectSession(); // Create new if empty
    }
  };

  const handleListDemos = async () => {
    if (!isMcrSessionActive || !isWsServiceConnected) { alert("Connect to a session and ensure WebSocket is active first."); return; }
    try {
      const response = await apiService.invokeTool('demo.list');
      if (response.success) {
        setDemos(response.data || []);
      } else {
        addMessageToHistory({type: 'system', text: `Error listing demos: ${response.message || 'Unknown error'}`});
        setDemos([]);
      }
    } catch (error) {
      addMessageToHistory({type: 'system', text: `Error: ${error.message || 'Failed to list demos'}`});
      setDemos([]);
    }
  };

  const handleRunDemo = async (demoId) => {
    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) { alert("Connect to a session and ensure WebSocket is active first."); return; }
    addMessageToHistory({ type: 'system', text: `🚀 Attempting to run demo: ${demoId}...` });
    try {
      const response = await apiService.invokeTool('demo.run', { demoId, sessionId });
      addMessageToHistory({
        type: 'mcr',
        isDemo: true,
        demoPayload: response.data,
        response: response,
      });
      // KB update should be handled by `kb_updated` message or manual refresh.
    } catch (error) {
      addMessageToHistory({
        type: 'mcr',
        isDemo: true,
        response: { success: false, message: `Client-side error running demo ${demoId}: ${error.message}` },
      });
    }
  };

  const listOntologies = async () => {
    if (!isMcrSessionActive || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: '⚠️ Session not active. Cannot list ontologies.'}); return; }
    try {
      const response = await apiService.invokeTool('ontology.list', { includeRules: false });
      if (response.success) setOntologies(response.data || []);
      else addMessageToHistory({type: 'system', text: `❌ Error listing ontologies: ${response.message}`});
    } catch (error) { addMessageToHistory({type: 'system', text: `❌ Error: ${error.message || 'Failed to list ontologies'}`});}
  };

  const viewOntology = async (ontologyName) => {
    if (!isMcrSessionActive || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: '⚠️ Session not active. Cannot view ontology.'}); return; }
    try {
      const response = await apiService.invokeTool('ontology.get', { name: ontologyName, includeRules: true });
      if (response.success && response.data) {
        setSelectedOntologyContent({ name: response.data.name, rules: response.data.rules || "// No rules defined." });
        setIsOntologyModalOpen(true);
      } else {
        addMessageToHistory({type: 'system', text: `❌ Error fetching ontology '${ontologyName}': ${response.message}`});
      }
    } catch (error) { addMessageToHistory({type: 'system', text: `❌ Error: ${error.message || `Failed to fetch ontology ${ontologyName}`}`});}
  };

  const loadOntologyToSession = async (ontologyName) => {
    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: '⚠️ Session not active. Cannot load ontology.'}); return; }
    addMessageToHistory({ type: 'system', text: `➕ Loading ontology '${ontologyName}' to session...` });
    try {
      const ontResponse = await apiService.invokeTool('ontology.get', { name: ontologyName, includeRules: true });
      if (ontResponse.success && ontResponse.data?.rules) {
        const assertResponse = await apiService.invokeTool('session.assert_rules', { sessionId, rules: ontResponse.data.rules });
        if (assertResponse.success) {
          addMessageToHistory({type: 'system', text: `✅ Ontology '${ontologyName}' rules asserted successfully. KB updated.`});
        } else {
          addMessageToHistory({type: 'system', text: `❌ Error asserting ontology '${ontologyName}': ${assertResponse.message || 'Unknown error'}`});
        }
      } else {
        addMessageToHistory({type: 'system', text: `❌ Error getting ontology rules for '${ontologyName}': ${ontResponse.message}`});
      }
    } catch (error) { addMessageToHistory({type: 'system', text: `❌ Error: ${error.message || 'Failed to load ontology'}`});}
  };

  const listStrategies = async () => {
    if (!isMcrSessionActive || !isWsServiceConnected) { addMessageToHistory({type: 'system', text: '⚠️ Session not active. Cannot list strategies.'}); return; }
    try {
      const response = await apiService.invokeTool('strategy.list');
      if (response.success) setStrategies(response.data || []);
      else addMessageToHistory({type: 'system', text: `❌ Error listing strategies: ${response.message}`});
    } catch (error) { addMessageToHistory({type: 'system', text: `❌ Error: ${error.message || 'Failed to list strategies'}`});}
  };

  const viewStrategy = (strategy) => {
    setSelectedStrategyContent({ name: strategy.name, description: strategy.description, definition: strategy.definition });
    setIsStrategyModalOpen(true);
  };

  const handleSetStrategy = async (strategyId) => {
    if (!isMcrSessionActive || !isWsServiceConnected) { alert("Connect to a session and ensure WebSocket is active first."); return; }
    try {
      const response = await apiService.invokeTool('strategy.setActive', { strategyId });
      if (response.success) {
        addMessageToHistory({type: 'system', text: `✅ Strategy set to ${response.data.activeStrategyId}`});
        setActiveStrategy(response.data.activeStrategyId);
      } else {
        addMessageToHistory({type: 'system', text: `❌ Error setting strategy: ${response.message}`});
      }
    } catch (error) { addMessageToHistory({type: 'system', text: `❌ Error: ${error.message || 'Failed to set strategy'}`}); }
  };

  return (
    <div className="sidebar left-sidebar">
      <h3>⚙️ Config & Context</h3>
      <div>
        <h4>🔌 Session Management</h4>
        <div style={{display: 'flex', alignItems: 'center', marginBottom: '0.5rem'}}>
            <input type="text" value={tempSessionId} onChange={(e) => setTempSessionId(e.target.value)} placeholder="Session ID (optional)" disabled={isMcrSessionActive || !isWsServiceConnected} style={{flexGrow: 1, marginRight: '5px'}}/>
            {!isMcrSessionActive ?
              <button onClick={handleConnect} disabled={!isWsServiceConnected} title="Connect or Create Session">🟢 Connect</button> :
              <button onClick={disconnectSession} disabled={!isWsServiceConnected} title="Disconnect Session">🔴 Disconnect</button>
            }
        </div>
        {isMcrSessionActive && <p className="text-muted">🔑 Active Session: {sessionId}</p>}
      </div> <hr />

      <div>
        <h4>📚 Ontologies</h4>
        <button onClick={listOntologies} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Refresh Ontology List">🔄 List Ontologies</button>
        {ontologies.length === 0 && isMcrSessionActive && <p className="text-muted" style={{marginTop:'5px'}}>🤷 No ontologies found.</p>}
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
        <button onClick={handleListDemos} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Refresh Demo List">🔄 List Demos</button>
        {demos.length === 0 && isMcrSessionActive && <p className="text-muted" style={{marginTop:'5px'}}>🤷 No demos found.</p>}
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
        <button onClick={listStrategies} disabled={!isMcrSessionActive || !isWsServiceConnected} title="Refresh Strategy List">🔄 List Strategies</button>
        <p className="text-muted" style={{marginTop:'5px'}}>🎯 Active: <strong style={{color: '#58a6ff'}}>{activeStrategy || 'N/A'}</strong></p>
        {strategies.length === 0 && isMcrSessionActive && <p className="text-muted">🤷 No strategies found.</p>}
        <ul>{strategies.map(strat => (
          <li key={strat.id || strat.name}
              className={`strategy-item ${activeStrategy === strat.id ? 'active-strategy' : ''}`}
              style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <span>{strat.name} <small>({strat.id})</small></span>
            <div>
              <button onClick={() => viewStrategy(strat)} disabled={!isMcrSessionActive || !isWsServiceConnected} title="View Strategy Details">👁️ View</button>
              <button onClick={() => handleSetStrategy(strat.id)} disabled={!isMcrSessionActive || !isWsServiceConnected || activeStrategy === strat.id} title="Set as Active Strategy" style={{marginLeft:'5px'}}>
                {activeStrategy === strat.id ? '✅ Active' : '➡️ Set'}
              </button>
            </div>
          </li>
        ))}</ul>
      </div>

      <Modal isOpen={isOntologyModalOpen} onClose={() => setIsOntologyModalOpen(false)} title={`📚 Ontology: ${selectedOntologyContent.name}`}>
        <PrologCodeViewer code={selectedOntologyContent.rules} title={selectedOntologyContent.name} addMessageToHistory={addMessageToHistory} />
      </Modal>

      <Modal isOpen={isStrategyModalOpen} onClose={() => setIsStrategyModalOpen(false)} title={`🛠️ Strategy: ${selectedStrategyContent.name}`}>
        <p><strong>Description:</strong></p>
        <p style={{whiteSpace: 'pre-wrap', marginBottom: '15px'}}>{selectedStrategyContent.description || "No description available."}</p>
        {selectedStrategyContent.definition ? (
          <>
            <p><strong>📜 Definition (JSON):</strong></p>
            <pre style={{maxHeight: '40vh', overflow: 'auto', background: '#0d1117', border: '1px solid #30363d', padding: '10px', borderRadius: '4px'}}>
              {JSON.stringify(selectedStrategyContent.definition, null, 2)}
            </pre>
          </>
        ) : (
          <p className="text-muted">🤷 Full JSON definition not available for display.</p>
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

export default LeftSidebar;
