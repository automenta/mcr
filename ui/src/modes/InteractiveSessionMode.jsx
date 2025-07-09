// ui/src/modes/InteractiveSessionMode.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../apiService';
import DataListViewer from '../components/DataListViewer'; // Import the generic list viewer

// Placeholder components for panes
const ConfigurationPane = ({
    currentSessionId,
    onSessionChange,
    activeStrategy,
    setActiveStrategy,
    availableTools,
    // onAssertOntologyRules // This prop is no longer needed as logic is encapsulated
}) => {
    const [newSessionId, setNewSessionId] = useState('');
    // const [allSessions, setAllSessions] = useState([]); // Future: fetch from server
    const [ontologies, setOntologies] = useState([]);
    const [ontologiesLoading, setOntologiesLoading] = useState(false);
    const [demos, setDemos] = useState([]);
    const [demosLoading, setDemosLoading] = useState(false);
    const [strategies, setStrategies] = useState([]);
    const [strategiesLoading, setStrategiesLoading] = useState(false);
    const [selectedStrategy, setSelectedStrategy] = useState(activeStrategy);

    useEffect(() => {
        setSelectedStrategy(activeStrategy);
    }, [activeStrategy]);

    // Fetch initial data
    useEffect(() => {
        setOntologiesLoading(true);
        apiClient.list_ontologies({ includeContent: false })
            .then(res => { if (res.success) setOntologies(res.data || []); }) // Ensure data is array
            .catch(err => console.error("Error fetching ontologies", err))
            .finally(() => setOntologiesLoading(false));

        setDemosLoading(true);
        apiClient.list_demos()
            .then(res => { if (res.success) setDemos(res.data || []); }) // Ensure data is array
            .catch(err => console.error("Error fetching demos", err))
            .finally(() => setDemosLoading(false));

        setStrategiesLoading(true);
        apiClient.list_strategies()
            .then(res => { if (res.success) setStrategies(res.data || []); }) // Ensure data is array
            .catch(err => console.error("Error fetching strategies", err))
            .finally(() => setStrategiesLoading(false));
    }, []);

    const handleCreateSession = async () => {
        try {
            const result = await apiClient.create_session();
            if (result.success && result.data && result.data.id) {
                onSessionChange(result.data.id);
                setNewSessionId('');
            } else {
                alert(`Failed to create session: ${result.error?.message || 'Unknown error'}`);
            }
        } catch (error) {
            alert(`Error creating session: ${error.message}`);
        }
    };

    const handleSwitchSession = () => {
        if (newSessionId.trim()) {
            onSessionChange(newSessionId.trim());
        }
    };

    const handleDeleteSession = async () => {
        if (!currentSessionId) {
            alert("No active session to delete.");
            return;
        }
        if (window.confirm(`Are you sure you want to delete session ${currentSessionId}?`)) {
            try {
                const result = await apiClient.delete_session({ sessionId: currentSessionId });
                if (result.success) {
                    alert(`Session ${currentSessionId} deleted.`);
                    onSessionChange(null);
                } else {
                    alert(`Failed to delete session: ${result.error?.message || 'Unknown error'}`);
                }
            } catch (error) {
                alert(`Error deleting session: ${error.message}`);
            }
        }
    };

    const handleLoadOntology = async (ontology) => {
        if (!currentSessionId) {
            alert("Please create or select a session first.");
            return;
        }
        try {
            const result = await apiClient.load_ontology_into_session({ sessionId: currentSessionId, ontologyName: ontology.name });
            if (result.success) {
                alert(`Ontology '${ontology.name}' rules are being asserted to session ${currentSessionId}.`);
            } else {
                alert(`Failed to load ontology '${ontology.name}': ${result.error?.message || 'Unknown error'}`);
            }
        } catch (error) {
            alert(`Error loading ontology '${ontology.name}': ${error.message}`);
        }
    };

    const handleRunDemo = async (demo) => {
        if (!currentSessionId) {
            alert("Please create or select a session first.");
            return;
        }
        try {
            const result = await apiClient.run_demo_in_session({ sessionId: currentSessionId, demoId: demo.id });
            if (result.success) {
                alert(`Demo '${demo.name}' run in session ${currentSessionId}. Results: ${JSON.stringify(result.results || result.message)}`);
            } else {
                alert(`Failed to run demo '${demo.name}': ${result.error?.message || 'Unknown error'}`);
            }
        } catch (error) {
            alert(`Error running demo '${demo.name}': ${error.message}`);
        }
    };

    const handleChangeStrategy = async (event) => {
        const newStrategyId = event.target.value;
        setSelectedStrategy(newStrategyId);
        try {
            const result = await apiClient.set_active_strategy({ strategyId: newStrategyId });
            if (result.success) {
                setActiveStrategy(newStrategyId);
                alert(`Active strategy set to ${newStrategyId}`);
            } else {
                alert(`Failed to set strategy: ${result.error?.message || 'Unknown error'}`);
                setSelectedStrategy(activeStrategy);
            }
        } catch (error) {
            alert(`Error setting strategy: ${error.message}`);
            setSelectedStrategy(activeStrategy);
        }
    };

    const ontologyItemConfig = {
        displayField: 'name',
        actions: [
            { label: 'Load to Session', onClick: handleLoadOntology, disabled: !currentSessionId }
        ]
    };

    const demoItemConfig = {
        displayField: 'name',
        actions: [
            { label: 'Run', onClick: handleRunDemo, disabled: !currentSessionId }
        ]
    };

    return (
        <div className="sidebar">
            <h4>Configuration & Context</h4>

            <div className="config-section">
                <h5>Session Info</h5>
                <p>Current Session ID: {currentSessionId || 'None'}</p>
                <input
                    type="text"
                    value={newSessionId}
                    onChange={(e) => setNewSessionId(e.target.value)}
                    placeholder="Enter Session ID to switch"
                />
                <button onClick={handleSwitchSession} disabled={!newSessionId.trim()}>Switch Session</button>
                <button onClick={handleCreateSession}>New Session</button>
                <button onClick={handleDeleteSession} disabled={!currentSessionId} className="secondary">Delete Current Session</button>
            </div>

            <div className="config-section">
                <h5>Active Strategy: {activeStrategy || 'N/A'}</h5>
                 <select value={selectedStrategy} onChange={handleChangeStrategy} disabled={strategiesLoading || strategies.length === 0}>
                    {strategiesLoading && <option>Loading strategies...</option>}
                    {!strategiesLoading && <option value="">-- Select Strategy --</option>}
                    {Array.isArray(strategies) && strategies.map(strategy => (
                        <option key={strategy.id} value={strategy.id}>
                            {strategy.name} ({strategy.id})
                        </option>
                    ))}
                </select>
            </div>

            <DataListViewer
                title="Ontologies"
                items={ontologies}
                itemConfig={ontologyItemConfig}
                loading={ontologiesLoading}
                emptyMessage="No ontologies found."
            />

            <DataListViewer
                title="Demos"
                items={demos}
                itemConfig={demoItemConfig}
                loading={demosLoading}
                emptyMessage="No demos found."
            />
        </div>
    );
};

const InteractionPane = ({ currentSessionId, activeStrategy }) => {
    const [inputText, setInputText] = useState('');
    const [history, setHistory] = useState([]); // { type: 'user' | 'mcr' | 'system' | 'error', text: '', details: {} }
    const [inputType, setInputType] = useState('smart'); // 'smart', 'assert', 'query'

    const addMessageToHistory = (type, text, details = null) => {
        setHistory(prev => [...prev, { type, text, details, timestamp: Date.now() }]);
    };

    useEffect(() => { // Clear history on session change
        setHistory([]);
        if (currentSessionId) {
            addMessageToHistory('system', `Switched to session: ${currentSessionId}. Active strategy: ${activeStrategy || 'N/A'}`);
        } else {
            addMessageToHistory('system', `No active session.`);
        }
    }, [currentSessionId, activeStrategy]);


    const handleSubmit = async () => {
        if (!inputText.trim()) return;
        if (!currentSessionId) {
            addMessageToHistory('error', 'No active session. Please create or select one first.');
            return;
        }

        const currentText = inputText;
        setInputText('');
        addMessageToHistory('user', currentText);

        let operation = inputType;
        if (operation === 'smart') {
            operation = currentText.endsWith('?') ? 'query' : 'assert';
        }

        try {
            if (operation === 'assert') {
                const result = await apiClient.assert_nl_to_session({ sessionId: currentSessionId, naturalLanguageText: currentText });
                if (result.success) {
                    addMessageToHistory('mcr', result.data?.message || 'Asserted.', result.data);
                    // KB update will refresh the live view via WebSocket broadcast
                } else {
                    addMessageToHistory('error', `Assert failed: ${result.error?.message || 'Unknown error'}`, result.error?.details);
                }
            } else if (operation === 'query') {
                const result = await apiClient.query_session_with_nl({ sessionId: currentSessionId, naturalLanguageQuestion: currentText, options: {debug: true, style: 'conversational'} });
                if (result.success) {
                    addMessageToHistory('mcr', result.data?.answer || 'No answer.', result.data?.debugInfo);
                } else {
                    addMessageToHistory('error', `Query failed: ${result.error?.message || 'Unknown error'}`, result.error?.details || result.debugInfo);
                }
            }
        } catch (error) {
             addMessageToHistory('error', `Operation failed: ${error.message}`, error);
        }
    };

    const toggleDetails = (timestamp) => {
        setHistory(prev => prev.map(msg =>
            msg.timestamp === timestamp ? { ...msg, showDetails: !msg.showDetails } : msg
        ));
    };

    return (
        <div className="main-content chat-repl-pane">
            <h4>Interaction (Chat REPL)</h4>
             <p>Session: {currentSessionId || "None"} | Strategy: {activeStrategy || "N/A"}</p>
            <div className="chat-history">
                {history.map((msg) => (
                    <div key={msg.timestamp} className={`message ${msg.type}-message`}>
                        <strong>{msg.type.toUpperCase()}:</strong> {msg.text}
                        {msg.details && (
                            <>
                                <span className="details-toggle" onClick={() => toggleDetails(msg.timestamp)}>
                                    {msg.showDetails ? 'Hide Details' : 'Show Details'}
                                </span>
                                {msg.showDetails && <pre className="details-content">{JSON.stringify(msg.details, null, 2)}</pre>}
                            </>
                        )}
                    </div>
                ))}
            </div>
            <div className="chat-input-area">
                <select value={inputType} onChange={e => setInputType(e.target.value)}>
                    <option value="smart">Smart (Assert/Query)</option>
                    <option value="assert">Assert</option>
                    <option value="query">Query</option>
                </select>
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                    placeholder="Type your message or query..."
                    disabled={!currentSessionId}
                />
                <button onClick={handleSubmit} disabled={!currentSessionId || !inputText.trim()}>Send</button>
            </div>
        </div>
    );
};

const LiveStateViewerPane = ({ knowledgeBase, currentSessionId }) => {
    return (
        <div className="live-state-viewer">
            <h4>Live State Viewer (Session: {currentSessionId || 'None'})</h4>
            <pre>{knowledgeBase || (currentSessionId ? "Knowledge base is empty or not loaded." : "No active session.")}</pre>
        </div>
    );
};


const InteractiveSessionMode = ({
    currentSessionId,
    onSessionChange,
    knowledgeBase,
    setKnowledgeBase, /* Prop to allow optimistic updates or direct sets if needed */
    activeStrategy,
    setActiveStrategy,
    availableTools
}) => {

  // This is a conceptual function for how an ontology's rules might be asserted.
  // The actual logic for "loading" an ontology (i.e., asserting its rules)
  // should ideally be a dedicated tool on the server.
  // For now, this function is passed down but ConfigurationPane uses `load_ontology_into_session` tool.
  const assertOntologyRulesToSession = async (rules) => {
    if (!currentSessionId) {
      alert("No active session to assert rules to.");
      return;
    }
    // This is a simplified example. A real implementation might need to break down
    // rules or use a specific server tool to assert raw Prolog.
    // The `assert_nl_to_session` tool expects natural language.
    // For now, we're relying on `load_ontology_into_session` tool which is better.
    try {
      // This is a placeholder for what a direct rule assertion might look like
      // if we had a tool like `assert_prolog_rules_to_session`.
      // Since we don't, this specific function isn't fully utilized by ConfigurationPane's ontology load.
      console.warn("assertOntologyRulesToSession called, but ConfigurationPane uses a dedicated server tool for loading ontologies.");
      // const result = await apiClient.assert_nl_to_session({
      //   sessionId: currentSessionId,
      //   naturalLanguageText: `The following Prolog rules are asserted: ${rules}`
      // });
      // if (result.success) {
      //   console.log("Ontology rules asserted (simulated via NL). KB will update via WebSocket.");
      // } else {
      //   alert(`Failed to assert ontology rules: ${result.error?.message}`);
      // }
    } catch (error) {
      alert(`Error asserting ontology rules: ${error.message}`);
    }
  };


  return (
    <div className="workbench-container">
      <ConfigurationPane
        currentSessionId={currentSessionId}
        onSessionChange={onSessionChange}
        activeStrategy={activeStrategy}
        setActiveStrategy={setActiveStrategy}
        availableTools={availableTools}
        onAssertOntologyRules={assertOntologyRulesToSession} // Passed down
      />
      <InteractionPane
        currentSessionId={currentSessionId}
        activeStrategy={activeStrategy}
      />
      <LiveStateViewerPane knowledgeBase={knowledgeBase} currentSessionId={currentSessionId} />
    </div>
  );
};

export default InteractiveSessionMode;
