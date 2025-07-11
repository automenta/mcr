import React, { useState, useEffect } from 'react'; // Removed useRef
import './App.css'; // Using App.css for main layout styles
import apiService from './apiService';

// CodeMirror Imports
// import { EditorState } from '@codemirror/state'; // Moved to PrologCodeViewer
// import { EditorView, keymap } from '@codemirror/view'; // Moved to PrologCodeViewer
// import { basicSetup } from 'codemirror'; // Moved to PrologCodeViewer
// import { oneDark } from '@codemirror/theme-one-dark'; // Moved to PrologCodeViewer
// import { prolog } from 'codemirror-lang-prolog'; // Moved to PrologCodeViewer
// import PrologCodeViewer from './components/PrologCodeViewer'; // No longer used directly in App.jsx

import SystemAnalysisMode from './components/SystemAnalysis/SystemAnalysisMode';
import InteractiveSessionMode from './components/InteractiveSession/InteractiveSessionMode';
// Modal and DirectAssertionEditor are now imported within their respective children (e.g. LeftSidebar)
// No need to import Modal, DirectAssertionEditor, LeftSidebar, MainInteraction, RightSidebar here anymore.

// CodeMirror related imports are also moved to the components that use them (PrologCodeViewer, RightSidebar)

// --- Main App Component ---
function App() {
  const [currentMode, setCurrentMode] = useState('interactive'); // 'interactive' or 'analysis'
  const [isConnected, setIsConnected] = useState(false); // true if MCR session is active
  const [sessionId, setSessionId] = useState(null);
  const [currentKb, setCurrentKb] = useState('');
  const [activeStrategy, setActiveStrategy] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isWsServiceConnected, setIsWsServiceConnected] = useState(false); // WebSocket service connection status
  const [wsConnectionStatus, setWsConnectionStatus] = useState('⏳ Initializing...');

  const handleServerMessage = (message) => {
    if (message.type === 'connection_ack') {
      console.log("Connection ACK received from server:", message.message);
    }
    if (message.type === 'kb_updated') {
      if (message.payload?.sessionId === sessionId) {
        setCurrentKb(message.payload.fullKnowledgeBase || (message.payload.newFacts || []).join('\n'));
        addMessageToHistory({type: 'system', text: `⚙️ KB updated remotely. New facts: ${message.payload.newFacts?.join(', ')}`});
      }
    }
    if (message.type === 'tool_result' && message.payload?.success) {
        if (message.payload?.data?.activeStrategyId && message.payload?.message?.includes("strategy set to")) {
            setActiveStrategy(message.payload.data.activeStrategyId);
        }
        if (sessionId && message.payload?.addedFacts && message.payload?.message?.includes("asserted")) {
            // Rely on kb_updated for actual KB content, but can log here if desired
            // addMessageToHistory({type: 'system', text: `✅ Assertion successful, waiting for KB update broadcast.`});
        }
    }
  };

  useEffect(() => {
    apiService.addMessageListener(handleServerMessage);

    setWsConnectionStatus('🔌 Connecting...');
    apiService.connect()
      .then(() => {
        setIsWsServiceConnected(true);
        setWsConnectionStatus('🟢 Connected');
        console.log("Successfully connected to WebSocket service.");
        // Fetch global active strategy once WS is connected, not dependent on MCR session.
        fetchGlobalActiveStrategy();
      })
      .catch(err => {
        console.error("Initial auto-connect to WebSocket service failed:", err);
        setIsWsServiceConnected(false);
        setWsConnectionStatus(`🔴 Error: ${err.message || 'Failed to connect'}. Retrying...`);
      });

    return () => {
      apiService.removeMessageListener(handleServerMessage);
      apiService.disconnect();
    };
  }, []);

  const connectToSession = async (sidToConnect) => {
    if (!isWsServiceConnected) {
        addMessageToHistory({type: 'system', text: "⚠️ WebSocket service not connected. Cannot manage sessions."});
        setWsConnectionStatus('🔴 Error: WebSocket service not available');
        return;
    }
    try {
      let sessionToUse = sidToConnect;
      let systemMessageText;
      if (!sessionToUse) { // Create new session
        const createResponse = await apiService.invokeTool('session.create');
        if (createResponse.success && createResponse.data?.id) {
            sessionToUse = createResponse.data.id;
            systemMessageText = `✨ New session created: ${sessionToUse}`;
        } else {
            throw new Error(createResponse.message || 'Failed to create session');
        }
      } else { // Use existing session ID
         const getResponse = await apiService.invokeTool('session.get', { sessionId: sessionToUse });
         if (!getResponse.success) {
            // Option: try to create if get fails for an existing ID that's no longer valid
            // For now, assume get failing means it's an issue.
            throw new Error(getResponse.message || `Failed to get session ${sessionToUse}`);
         }
         systemMessageText = `🔌 Connected to session: ${sessionToUse}`;
      }
      setSessionId(sessionToUse);
      setIsConnected(true); // MCR Session is now active
      addMessageToHistory({type: 'system', text: systemMessageText});
      fetchCurrentKb(sessionToUse); // Fetch KB for the newly connected/created session
      // Active strategy might be session-specific or global. If global, fetchActiveStrategy()
      // was already called. If session-specific, it might be part of session.get or need another call.
      // For now, assuming strategy.getActive is global or defaults appropriately.
      fetchGlobalActiveStrategy(); // Re-fetch, in case it's relevant or changed
    } catch (error) {
      addMessageToHistory({type: 'system', text: `❌ Error with session: ${error.message}`});
      setSessionId(null);
      setIsConnected(false);
    }
  };

  const disconnectFromSession = () => {
    addMessageToHistory({type: 'system', text: `🔌 UI disconnected from session: ${sessionId}`});
    setSessionId(null);
    setIsConnected(false); // MCR Session is no longer active
    setCurrentKb('');
    setChatHistory([]); // Clear chat for this session
    // Active strategy might reset to a global default or remain as is if not session-dependent.
    // fetchGlobalActiveStrategy(); // Optionally fetch global default strategy
  };

  const fetchCurrentKb = async (sid) => {
    if (!sid || !isWsServiceConnected) return; // Need session and WS connection
    try {
      const response = await apiService.invokeTool('session.get', { sessionId: sid });
      if (response.success && response.data) {
        setCurrentKb(response.data.facts || 'KB data not found in session object.');
      } else {
        setCurrentKb('⚠️ Failed to load KB.');
        addMessageToHistory({type: 'system', text: `⚠️ Error loading KB for session ${sid}: ${response.message}`});
      }
    } catch (error) {
        setCurrentKb(`❌ Exception loading KB: ${error.message}`);
        addMessageToHistory({type: 'system', text: `❌ Exception loading KB for session ${sid}: ${error.message}`});
    }
  };

  // Fetches the globally (or default) active strategy.
  const fetchGlobalActiveStrategy = async () => {
    if (!isWsServiceConnected) return; // Requires WS connection
    try {
        const response = await apiService.invokeTool('strategy.getActive');
        if(response.success && response.data?.activeStrategyId) {
            setActiveStrategy(response.data.activeStrategyId);
        } else {
            setActiveStrategy('N/A (error)');
            // addMessageToHistory({type: 'system', text: `⚠️ Could not fetch active strategy: ${response.message}`});
        }
    } catch (error) {
        setActiveStrategy(`❌ Error fetching strategy: ${error.message}`);
        // addMessageToHistory({type: 'system', text: `❌ Exception fetching active strategy: ${error.message}`});
    }
  };

  const addMessageToHistory = (message) => {
    setChatHistory(prev => [...prev, message]);
  };

  return (
    <>
      <div className="app-header">
        <div className="app-mode-switcher">
          <button onClick={() => setCurrentMode('interactive')} disabled={currentMode === 'interactive'}>💬 Interactive Session</button>
          <button onClick={() => setCurrentMode('analysis')} disabled={currentMode === 'analysis'}>📊 System Analysis</button>
        </div>
        <div className="ws-status" title={`WebSocket Connection: ${wsConnectionStatus}`}>
          {wsConnectionStatus}
          {!isWsServiceConnected && wsConnectionStatus.startsWith('🔴 Error') && (
            <button onClick={() => {
              setWsConnectionStatus('🔌 Connecting...');
              apiService.connect().then(() => {
                setIsWsServiceConnected(true);
                setWsConnectionStatus('🟢 Connected');
                fetchGlobalActiveStrategy();
              }).catch(err => {
                setWsConnectionStatus(`🔴 Error: ${err.message || 'Failed to connect'}. Retrying...`);
              });
            }} style={{marginLeft: '10px'}}>
              🔄 Retry
            </button>
          )}
        </div>
      </div>
      {currentMode === 'interactive' ? (
        <InteractiveSessionMode
          sessionId={sessionId}
          setSessionId={setSessionId}
          activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy}
          currentKb={currentKb}
          setCurrentKb={setCurrentKb}
          connectSession={connectToSession}
          disconnectSession={disconnectFromSession}
          isMcrSessionActive={isConnected} // Pass MCR session status
          isWsServiceConnected={isWsServiceConnected}
          addMessageToHistory={addMessageToHistory}
          chatHistory={chatHistory}
          fetchActiveStrategy={fetchGlobalActiveStrategy} // Pass global strategy fetcher
          fetchCurrentKb={fetchCurrentKb}
        />
      ) : (
        <SystemAnalysisMode />
      )}
    </>
  );
}

export default App;
