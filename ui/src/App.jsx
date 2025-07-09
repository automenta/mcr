// ui/src/App.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from './apiService'; // Will create this next
import InteractiveSessionMode from './modes/InteractiveSessionMode'; // Will create this
import SystemAnalysisMode from './modes/SystemAnalysisMode'; // Will create this
// import './styles.css'; // Basic styling loaded by index.html

const App = () => {
  const [mode, setMode] = useState('interactive'); // 'interactive' or 'analysis'
  const [clientId, setClientId] = useState(null);
  const [availableTools, setAvailableTools] = useState([]);
  const [serverConnected, setServerConnected] = useState(false);
  const [error, setError] = useState(null);

  // Global states that might be shared or lifted
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [knowledgeBase, setKnowledgeBase] = useState(''); // Live KB string
  const [activeStrategy, setActiveStrategy] = useState(''); // Store active strategy

  const handleConnectionAck = useCallback((data) => {
    setClientId(data.clientId);
    setAvailableTools(data.availableTools);
    setServerConnected(true);
    setError(null);
    console.log('Connected to MCR server with client ID:', data.clientId);
    console.log('Available tools:', data.availableTools);
  }, []);

  const handleKbUpdate = useCallback((data) => {
    console.log('KB Update received:', data);
    if (currentSessionId === data.sessionId) {
      setKnowledgeBase(data.knowledgeBase);
    }
  }, [currentSessionId]);

  const handleToolResult = useCallback((data) => {
    // Generic tool results can be logged here or handled by specific components that made the call
    console.log('Tool Result:', data);
    if (data.payload && data.payload.success === false) {
        // Display global errors for now, or let components handle them
        // setError(`Tool Error (${data.correlationId}): ${data.payload.error?.message || 'Unknown tool error'}`);
    }
    if (data.payload && data.payload.success === true && data.payload.data && data.payload.data.activeStrategy) {
        // Example: if get_active_strategy returns data.activeStrategy
        setActiveStrategy(data.payload.data.activeStrategy);
    }
  }, []);

  const handleServerError = useCallback((err) => {
    console.error('Server Error Message:', err);
    setError(err.message || 'An error occurred with the WebSocket connection.');
    // setServerConnected(false); // Could set to false if error is critical
  }, []);

  const handleDisconnect = useCallback(() => {
    console.warn('Disconnected from MCR server.');
    setServerConnected(false);
    setClientId(null);
    // setError('Disconnected from server. Attempting to reconnect...');
    // apiClient.connect() could be called here or after a timeout
  }, []);

  useEffect(() => {
    apiClient.setOnConnectionAck(handleConnectionAck);
    apiClient.setOnKbUpdate(handleKbUpdate);
    apiClient.setOnToolResult(handleToolResult); // For global tool results if needed
    apiClient.setOnError(handleServerError);
    apiClient.setOnDisconnect(handleDisconnect);

    apiClient.connect();

    return () => {
      apiClient.disconnect();
    };
  }, [handleConnectionAck, handleKbUpdate, handleToolResult, handleServerError, handleDisconnect]);

  // Effect to fetch active strategy when server connects or session changes
  useEffect(() => {
    if (serverConnected && currentSessionId) {
      apiClient.getActiveStrategy({ sessionId: currentSessionId }) // Pass sessionId
        .then(result => {
          if (result.success && result.data) { // result.data should be the strategyId string
            setActiveStrategy(result.data.activeStrategy || result.data); // Adjust based on actual tool response structure
          } else if (result.success && result.data === null) { // Strategy might be null if not set for session
            setActiveStrategy(''); // Or a default indicator
          }
        })
        .catch(err => {
          console.error("Failed to get active strategy for session", currentSessionId, err);
          // setActiveStrategy(''); // Clear or set to default on error
        });
    } else if (serverConnected && !currentSessionId) {
      // If there's no current session, maybe clear active strategy or set to a global default if applicable
      // For now, let's assume strategy is session-specific and clear it.
      // setActiveStrategy(''); // This might be too aggressive if user just de-selected a session
    }
  }, [serverConnected, currentSessionId]);


  if (!serverConnected && !error) {
    return <div>Connecting to MCR server...</div>;
  }

  if (error) {
    return <div className="error-text">Error: {error} <button onClick={() => apiClient.connect()}>Retry Connection</button></div>;
  }

  // Function to be passed to InteractiveSessionMode to update global state
  const handleSessionChange = (newSessionId) => {
    if (newSessionId !== currentSessionId) {
        setKnowledgeBase(''); // Clear KB when session changes
        setCurrentSessionId(newSessionId);
        // Notify server of session subscription change
        apiClient.send({
            type: 'client_update_session_subscription',
            payload: { sessionId: newSessionId }
        });
    }
  };


  return (
    <>
      <div className="mode-switcher">
        MCR Workbench (Client ID: {clientId})
        <button onClick={() => setMode('interactive')} className={mode === 'interactive' ? 'active' : ''}>Interactive Session</button>
        <button onClick={() => setMode('analysis')} className={mode === 'analysis' ? 'active' : ''}>System Analysis</button>
      </div>

      {mode === 'interactive' && (
        <InteractiveSessionMode
          currentSessionId={currentSessionId}
          onSessionChange={handleSessionChange}
          knowledgeBase={knowledgeBase}
          setKnowledgeBase={setKnowledgeBase} // Allow direct updates for optimistic UI
          activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy} // Allow components to update strategy
          availableTools={availableTools}
        />
      )}
      {mode === 'analysis' && <SystemAnalysisMode availableTools={availableTools} />}
    </>
  );
};

export default App;
