// ui/src/components/InteractiveSession/DemoPanel.jsx
import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import apiService from '../../apiService';

const DemoPanel = ({
  sessionId,
  isMcrSessionActive,
  isWsServiceConnected,
  addMessageToHistory,
}) => {
  const [demos, setDemos] = useState([]);

  const handleListDemos = useCallback(async () => {
    if (!isMcrSessionActive || !isWsServiceConnected) {
      setDemos([]);
      return;
    }
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
  }, [isMcrSessionActive, isWsServiceConnected, addMessageToHistory, setDemos]);

  useEffect(() => {
    if (isMcrSessionActive && isWsServiceConnected) { // Condition already in handleListDemos
      handleListDemos();
    } else {
      setDemos([]); // Ensure demos are cleared if not active
    }
  }, [isMcrSessionActive, isWsServiceConnected, sessionId, handleListDemos]); // Added handleListDemos


  const handleRunDemo = async (demoId) => {
    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) {
      // Using alert for immediate user feedback as this is a direct action button.
      // System messages via addMessageToHistory are also good but might be missed.
      alert("Connect to a session and ensure WebSocket is active first.");
      return;
    }
    addMessageToHistory({ type: 'system', text: `🚀 Attempting to run demo: ${demoId}...` });
    try {
      const response = await apiService.invokeTool('demo.run', { demoId, sessionId });
      // The response from demo.run is often large and contains the full interaction trace.
      // Displaying it directly in chat might be too verbose.
      // Instead, we can show a summary and make the full data available if needed.
      addMessageToHistory({
        type: 'mcr', // Indicates it's an MCR system message
        isDemo: true, // Specific flag for demo results
        demoPayload: response.data, // The actual data from the demo run
        response: response, // Includes success status and any messages
        text: `Demo '${demoId}' run attempt completed. Success: ${response.success}. ${response.message || ''}`
      });
      // KB update is handled by global kb_updated message
    } catch (error) {
      addMessageToHistory({
        type: 'mcr',
        isDemo: true,
        response: { success: false, message: `Client-side error running demo ${demoId}: ${error.message}` },
        text: `Client-side error running demo ${demoId}: ${error.message}`
      });
    }
  };

  return (
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
    </div>
  );
};

export default DemoPanel;
