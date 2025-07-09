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
    availableTools
}) => {
    const [newSessionId, setNewSessionId] = useState(''); // For manual input if needed
    const [allSessions, setAllSessions] = useState([]);
    const [sessionsLoading, setSessionsLoading] = useState(false);
    const [selectedSessionForSwitch, setSelectedSessionForSwitch] = useState('');

    const [ontologies, setOntologies] = useState([]);
    const [ontologiesLoading, setOntologiesLoading] = useState(false);
    const [showOntologyModal, setShowOntologyModal] = useState(false);
    const [editingOntology, setEditingOntology] = useState(null); // null for new, object for edit
    const [ontologyNameInput, setOntologyNameInput] = useState('');
    const [ontologyRulesInput, setOntologyRulesInput] = useState('');
    const [ontologyModalError, setOntologyModalError] = useState('');


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
            .then(res => { if (res.success) setOntologies(res.data || []); })
            .catch(err => console.error("Error fetching ontologies", err))
            .finally(() => setOntologiesLoading(false));

        setDemosLoading(true);
        apiClient.list_demos()
            .then(res => { if (res.success) setDemos(res.data || []); })
            .catch(err => console.error("Error fetching demos", err))
            .finally(() => setDemosLoading(false));

        setStrategiesLoading(true);
        apiClient.list_strategies()
            .then(res => { if (res.success) setStrategies(res.data || []); })
            .catch(err => console.error("Error fetching strategies", err))
            .finally(() => setStrategiesLoading(false));

        setSessionsLoading(true);
        apiClient.list_sessions()
            .then(res => { if (res.success) setAllSessions(res.data || []); })
            .catch(err => console.error("Error fetching sessions", err))
            .finally(() => setSessionsLoading(false));

    }, []); // Empty dependency array means this runs once on mount

    const refreshSessions = useCallback(() => { // Added useCallback for refreshSessions
        setSessionsLoading(true);
        apiClient.list_sessions()
            .then(res => { if (res.success) setAllSessions(res.data || []); })
            .catch(err => console.error("Error fetching sessions", err))
            .finally(() => setSessionsLoading(false));
    }, []);

    const handleCreateSession = async () => {
        try {
            const result = await apiClient.create_session();
            if (result.success && result.data && result.data.id) {
                onSessionChange(result.data.id);
                setNewSessionId(''); // Clear manual input if used
                setSelectedSessionForSwitch(result.data.id); // Select new session in dropdown
                refreshSessions(); // Refresh session list
            } else {
                alert(`Failed to create session: ${result.error?.message || 'Unknown error'}`);
            }
        } catch (error) {
            alert(`Error creating session: ${error.message}`);
        }
    };

    const handleSwitchSession = () => {
        // Use selectedSessionForSwitch from dropdown
        if (selectedSessionForSwitch) {
            onSessionChange(selectedSessionForSwitch);
        } else if (newSessionId.trim()) { // Fallback to manual input if dropdown not used
            onSessionChange(newSessionId.trim());
            setSelectedSessionForSwitch(newSessionId.trim());
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
                    setSelectedSessionForSwitch(''); // Clear selection
                    refreshSessions(); // Refresh session list
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
        if (!currentSessionId) {
            alert("Please select a session before changing its strategy.");
            event.target.value = selectedStrategy; // Revert dropdown
            return;
        }
        if (!newStrategyId) { // Handle case where user selects "-- Select Strategy --"
            setSelectedStrategy("");
            // Optionally, do nothing or revert to session's current strategy if known
            return;
        }

        setSelectedStrategy(newStrategyId); // Optimistically update UI
        try {
            // Use set_active_strategy_for_session
            const result = await apiClient.set_active_strategy_for_session({ sessionId: currentSessionId, strategyId: newStrategyId });
            if (result.success) {
                setActiveStrategy(newStrategyId); // Update global state via App.jsx
                alert(`Strategy for session ${currentSessionId} set to ${newStrategyId}`);
            } else {
                alert(`Failed to set strategy: ${result.error?.message || 'Unknown error'}`);
                setSelectedStrategy(activeStrategy); // Revert UI on failure
            }
        } catch (error) {
            alert(`Error setting strategy: ${error.message}`);
            setSelectedStrategy(activeStrategy); // Revert UI on failure
        }
    };

    const refreshOntologies = useCallback(() => {
        setOntologiesLoading(true);
        apiClient.list_ontologies({ includeContent: false })
            .then(res => { if (res.success) setOntologies(res.data || []); })
            .catch(err => console.error("Error fetching ontologies", err))
            .finally(() => setOntologiesLoading(false));
    }, []);

    // Actions for ontology CRUD
    const handleCreateNewOntology = () => {
        setEditingOntology(null);
        setOntologyNameInput('');
        setOntologyRulesInput('');
        setOntologyModalError('');
        setShowOntologyModal(true);
    };

    const handleEditOntology = async (ontology) => {
        setEditingOntology(ontology);
        setOntologyNameInput(ontology.name);
        setOntologyModalError('');
        setShowOntologyModal(true);
        try {
            // Fetch full ontology content for editing
            const result = await apiClient.get_ontology({ name: ontology.name });
            if (result.success && result.data) {
                setOntologyRulesInput(result.data.rules || '');
            } else {
                setOntologyModalError(`Failed to fetch rules for ${ontology.name}: ${result.error?.message}`);
                setOntologyRulesInput(''); // Clear rules if fetch failed
            }
        } catch (error) {
            setOntologyModalError(`Error fetching rules for ${ontology.name}: ${error.message}`);
            setOntologyRulesInput('');
        }
    };

    const handleSaveOntology = async () => {
        if (!ontologyNameInput.trim() || !ontologyRulesInput.trim()) {
            setOntologyModalError("Ontology name and rules cannot be empty.");
            return;
        }
        setOntologyModalError(''); // Clear previous errors

        try {
            let result;
            if (editingOntology) { // Update existing
                result = await apiClient.update_ontology({ name: editingOntology.name, rules: ontologyRulesInput });
            } else { // Create new
                result = await apiClient.create_ontology({ name: ontologyNameInput, rules: ontologyRulesInput });
            }

            if (result.success) {
                setShowOntologyModal(false);
                refreshOntologies(); // Refresh list
                alert(`Ontology '${ontologyNameInput || editingOntology.name}' ${editingOntology ? 'updated' : 'created'} successfully.`);
            } else {
                setOntologyModalError(result.error?.message || `Failed to ${editingOntology ? 'update' : 'create'} ontology.`);
            }
        } catch (error) {
            setOntologyModalError(`Error saving ontology: ${error.message}`);
        }
    };

    const handleDeleteOntology = async (ontology) => {
        if (window.confirm(`Are you sure you want to delete ontology ${ontology.name}?`)) {
            try {
                const result = await apiClient.delete_ontology({ name: ontology.name });
                if (result.success) {
                    alert(`Ontology '${ontology.name}' deleted.`);
                    // Refresh ontology list
                    apiClient.list_ontologies({ includeContent: false })
                        .then(res => { if (res.success) setOntologies(res.data || []); });
                } else {
                    alert(`Failed to delete ontology: ${result.error?.message || 'Unknown error'}`);
                }
            } catch (error) {
                alert(`Error deleting ontology: ${error.message}`);
            }
        }
    };


    const ontologyItemConfig = {
        displayField: 'name',
        actions: [
            { label: 'Load to Session', onClick: handleLoadOntology, disabled: !currentSessionId },
            { label: 'Edit', onClick: handleEditOntology },
            { label: 'Delete', onClick: handleDeleteOntology, className: 'action-delete'}
        ],
        // itemDetailRenderer: (item) => <pre>{item.rulesPreview || "No preview"}</pre> // If we fetch rules preview
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
                <div>
                    <select
                        value={selectedSessionForSwitch}
                        onChange={e => setSelectedSessionForSwitch(e.target.value)}
                        disabled={sessionsLoading}
                    >
                        <option value="">-- Select a Session --</option>
                        {sessionsLoading && <option>Loading sessions...</option>}
                        {Array.isArray(allSessions) && allSessions.map(session => (
                            <option key={session.id} value={session.id}>
                                {session.id} (Created: {new Date(session.createdAt).toLocaleTimeString()})
                            </option>
                        ))}
                    </select>
                    <button onClick={handleSwitchSession} disabled={!selectedSessionForSwitch}>Switch to Selected</button>
                </div>
                {/* Fallback manual input for session ID */}
                {/* <input
                    type="text"
                    value={newSessionId}
                    onChange={(e) => setNewSessionId(e.target.value)}
                    placeholder="Or Enter Session ID manually"
                />
                <button onClick={handleSwitchSession} disabled={!newSessionId.trim() && !selectedSessionForSwitch}>Switch Session</button> */}
                <button onClick={handleCreateSession}>New Session</button>
                <button onClick={handleDeleteSession} disabled={!currentSessionId} className="secondary">Delete Current Session</button>
                <button onClick={refreshSessions} disabled={sessionsLoading}>Refresh Sessions</button>
            </div>

            <div className="config-section">
                <h5>Active Strategy (Session: {currentSessionId || 'N/A'}): {activeStrategy || 'N/A'}</h5>
                 <select value={selectedStrategy} onChange={handleChangeStrategy} disabled={strategiesLoading || strategies.length === 0 || !currentSessionId}>
                    {strategiesLoading && <option>Loading strategies...</option>}
                    <option value="">-- Select Strategy for Session --</option>
                    {Array.isArray(strategies) && strategies.map(strategy => (
                        <option key={strategy.id} value={strategy.id}>
                            {strategy.name} ({strategy.id})
                        </option>
                    ))}
                </select>
            </div>

            {showOntologyModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h4>{editingOntology ? `Edit Ontology: ${editingOntology.name}` : "Create New Ontology"}</h4>
                        {ontologyModalError && <p className="error-text">{ontologyModalError}</p>}
                        <div className="form-group">
                            <label htmlFor="ontologyName">Name:</label>
                            <input
                                type="text"
                                id="ontologyName"
                                placeholder="Ontology Name (e.g., family_rules)"
                                value={ontologyNameInput}
                                onChange={e => setOntologyNameInput(e.target.value)}
                                readOnly={!!editingOntology}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="ontologyRules">Rules (Prolog):</label>
                            <textarea
                                id="ontologyRules"
                                placeholder="Enter Prolog rules... e.g., parent(john, mary)."
                                value={ontologyRulesInput}
                                onChange={e => setOntologyRulesInput(e.target.value)}
                                rows={10}
                                style={{ width: '100%', fontFamily: 'monospace' }}
                            />
                        </div>
                        <div className="modal-actions">
                            <button onClick={handleSaveOntology}>
                                {editingOntology ? "Save Changes" : "Create Ontology"}
                            </button>
                            <button onClick={() => setShowOntologyModal(false)} className="secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            <DataListViewer
                title="Ontologies"
                items={ontologies}
                itemConfig={ontologyItemConfig}
                loading={ontologiesLoading}
                emptyMessage="No ontologies found."
                headerActions={[{label: "Create New Ontology", onClick: handleCreateNewOntology }]}
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

        if (currentText.trim().toLowerCase() === '/clear') {
            setHistory([]);
            addMessageToHistory('system', 'Chat history cleared.');
            return;
        }

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

  // const assertOntologyRulesToSession = async (rules) => { // REMOVED
  // };


  return (
    <div className="workbench-container">
      <ConfigurationPane
        currentSessionId={currentSessionId}
        onSessionChange={onSessionChange}
        activeStrategy={activeStrategy}
        setActiveStrategy={setActiveStrategy}
        availableTools={availableTools}
        // onAssertOntologyRules={assertOntologyRulesToSession} // REMOVED
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
