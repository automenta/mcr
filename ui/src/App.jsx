import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import apiService from './apiService';
import AppHeader from './components/AppHeader';
import InteractiveSessionMode from './components/InteractiveSessionMode';
import SystemAnalysisMode from './components/SystemAnalysisMode';

function App() {
  const [currentMode, setCurrentMode] = useState('interactive'); // 'interactive' or 'analysis'
  const [isConnected, setIsConnected] = useState(false); // true if MCR session is active
  const [sessionId, setSessionId] = useState(null);
  const [currentKb, setCurrentKb] = useState('');
  const [activeStrategy, setActiveStrategy] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [isWsServiceConnected, setIsWsServiceConnected] = useState(false); // WebSocket service connection status
  const [wsConnectionStatus, setWsConnectionStatus] = useState('⏳ Initializing...');
  const [demos, setDemos] = useState([]);
  const [selectedDemo, setSelectedDemo] = useState(null);

  const addMessageToHistory = useCallback((message) => {
    setChatHistory(prev => [...prev, message]);
  }, []);

  const handleServerMessage = useCallback((message) => {
    if (message.type === 'connection_ack') {
      console.debug("[App] Connection ACK received:", message.message);
    }
    if (message.type === 'kb_updated') {
      if (message.payload?.sessionId === sessionId) {
        let fullKb = message.payload.fullKnowledgeBase;
        if (Array.isArray(fullKb)) {
          fullKb = fullKb.join('\n');
        } else if (typeof fullKb === 'object' && fullKb !== null) {
          fullKb = typeof fullKb.doc === 'string' ? fullKb.doc : JSON.stringify(fullKb);
          addMessageToHistory({type: 'system', text: `ℹ️ Full KB data in 'kb_updated' received as object, converted to string.`});
        }
        setCurrentKb(fullKb || '');
        addMessageToHistory({type: 'system', text: `⚙️ KB updated remotely. New facts: ${(message.payload.newFacts || []).join(', ')}`});
      }
    }
    if (message.type === 'tool_result' && message.payload?.success) {
        if (message.payload?.data?.activeStrategyId && message.payload?.message?.includes("strategy set to")) {
            setActiveStrategy(message.payload.data.activeStrategyId);
        }
    }
  }, [sessionId, addMessageToHistory, setCurrentKb, setActiveStrategy]);

  const fetchGlobalActiveStrategy = useCallback(async () => {
    if (!isWsServiceConnected) return;
    try {
        const response = await apiService.invokeTool('strategy.getActive');
        if(response.success && response.data?.activeStrategyId) {
            setActiveStrategy(response.data.activeStrategyId);
        } else {
            setActiveStrategy('N/A (error)');
        }
    } catch (error) {
        setActiveStrategy(`❌ Error fetching strategy: ${error.message}`);
    }
  }, [isWsServiceConnected, setActiveStrategy]);

  const fetchDemos = useCallback(async () => {
    if (!isWsServiceConnected) return;
    try {
      const response = await apiService.invokeTool('demo.list');
      if (response.success && Array.isArray(response.data)) {
        setDemos(response.data);
      } else {
        addMessageToHistory({ type: 'system', text: `⚠️ Could not load demos: ${response.message}` });
      }
    } catch (error) {
      addMessageToHistory({ type: 'system', text: `❌ Exception loading demos: ${error.message}` });
    }
  }, [isWsServiceConnected, addMessageToHistory]);

  useEffect(() => {
    apiService.addMessageListener(handleServerMessage);

    const handleConnectionStatus = (statusEvent) => {
      console.debug('[App] Connection status event:', statusEvent);
      switch (statusEvent.status) {
        case 'connected':
          setIsWsServiceConnected(true);
          setWsConnectionStatus('🟢 Connected');
          break;
        case 'reconnecting':
          setIsWsServiceConnected(false);
          setWsConnectionStatus(`🟡 Reconnecting... ${statusEvent.reason || ''}`);
          break;
        case 'disconnected_explicit':
          setIsWsServiceConnected(false);
          setWsConnectionStatus('⚪ Disconnected');
          break;
        case 'failed_max_attempts':
          setIsWsServiceConnected(false);
          setWsConnectionStatus(`🔴 Max reconnect attempts reached. ${statusEvent.message}`);
          break;
        case 'error':
          setIsWsServiceConnected(false);
          setWsConnectionStatus(`🔴 Error: ${statusEvent.message}. Retrying...`);
          break;
        default:
          setWsConnectionStatus(`❓ Unknown status: ${statusEvent.status}`);
      }
    };
    apiService.addEventListener('connection_status', handleConnectionStatus);

    setWsConnectionStatus('🔌 Connecting...');
    apiService.connect().catch(err => {
      console.error("Initial apiService.connect() promise rejected:", err);
    });

    return () => {
      apiService.removeMessageListener(handleServerMessage);
      apiService.removeEventListener('connection_status', handleConnectionStatus);
      apiService.disconnect();
    };
  }, [handleServerMessage]);

  useEffect(() => {
    if (isWsServiceConnected) {
      fetchGlobalActiveStrategy();
      fetchDemos();
    }
  }, [isWsServiceConnected, fetchGlobalActiveStrategy, fetchDemos]);

  const connectToSession = async (sidToConnect) => {
    if (!isWsServiceConnected) {
        addMessageToHistory({type: 'system', text: "⚠️ WebSocket service not connected. Cannot manage sessions."});
        setWsConnectionStatus('🔴 Error: WebSocket service not available');
        return;
    }
    try {
      let sessionToUse = sidToConnect;
      let systemMessageText;
      if (!sessionToUse) {
        const createResponse = await apiService.invokeTool('session.create');
        if (createResponse.success && createResponse.data?.id) {
            sessionToUse = createResponse.data.id;
            systemMessageText = `✨ New session created: ${sessionToUse}`;
        } else {
            throw new Error(createResponse.message || 'Failed to create session');
        }
      } else {
         const getResponse = await apiService.invokeTool('session.get', { sessionId: sessionToUse });
         if (!getResponse.success) {
            throw new Error(getResponse.message || `Failed to get session ${sessionToUse}`);
         }
         systemMessageText = `🔌 Connected to session: ${sessionToUse}`;
      }
      setSessionId(sessionToUse);
      setIsConnected(true);
      addMessageToHistory({type: 'system', text: systemMessageText});
      fetchCurrentKb(sessionToUse);
      fetchGlobalActiveStrategy();
    } catch (error) {
      addMessageToHistory({type: 'system', text: `❌ Error with session: ${error.message}`});
      setSessionId(null);
      setIsConnected(false);
    }
  };

  const disconnectFromSession = () => {
    addMessageToHistory({type: 'system', text: `🔌 UI disconnected from session: ${sessionId}`});
    setSessionId(null);
    setIsConnected(false);
    setCurrentKb('');
    setChatHistory([]);
  };

  const fetchCurrentKb = async (sid) => {
    if (!sid || !isWsServiceConnected) return;
    try {
      const response = await apiService.invokeTool('session.get', { sessionId: sid });
      if (response.success && response.data) {
        let kbData = response.data.facts;
        if (Array.isArray(kbData)) {
          kbData = kbData.join('\n');
        } else if (typeof kbData === 'object' && kbData !== null) {
          kbData = typeof kbData.doc === 'string' ? kbData.doc : JSON.stringify(kbData);
          addMessageToHistory({type: 'system', text: `ℹ️ KB data received as object, converted to string.`});
        }
        setCurrentKb(kbData || 'KB data not found or is empty.');
      } else {
        setCurrentKb('⚠️ Failed to load KB.');
        addMessageToHistory({type: 'system', text: `⚠️ Error loading KB for session ${sid}: ${response.message}`});
      }
    } catch (error) {
        setCurrentKb(`❌ Exception loading KB: ${error.message}`);
        addMessageToHistory({type: 'system', text: `❌ Exception loading KB for session ${sid}: ${error.message}`});
    }
  };

  const handleLoadDemo = async (demoId) => {
    if (!demoId || !sessionId) {
      addMessageToHistory({ type: 'system', text: '⚠️ Please select a demo and ensure you are connected to a session.' });
      return;
    }
    addMessageToHistory({ type: 'system', text: `🚀 Starting demo: ${demoId}...` });
    try {
      const response = await apiService.invokeTool('demo.run', { demoId, sessionId });
      if (response.success) {
        addMessageToHistory({ type: 'demo', messages: response.data.messages });
        // After the demo runs, it's good practice to refresh the KB state from the server
        fetchCurrentKb(sessionId);
      } else {
        addMessageToHistory({ type: 'system', text: `❌ Demo failed: ${response.message}` });
      }
    } catch (error) {
      addMessageToHistory({ type: 'system', text: `❌ Exception running demo: ${error.message}` });
    }
  };

  return (
    <div className="app-container">
      <AppHeader
        currentMode={currentMode}
        setCurrentMode={setCurrentMode}
        wsConnectionStatus={wsConnectionStatus}
        isWsServiceConnected={isWsServiceConnected}
        onRetryConnect={() => {
          setWsConnectionStatus('🔌 Connecting...');
          apiService.connect().catch(err => {
            setWsConnectionStatus(`🔴 Error: ${err.message || 'Failed to connect during retry'}.`);
          });
        }}
        sessionId={sessionId}
        setSessionId={setSessionId}
        connectSession={connectToSession}
        disconnectSession={disconnectFromSession}
        isMcrSessionActive={isConnected}
        demos={demos}
        selectedDemo={selectedDemo}
        setSelectedDemo={setSelectedDemo}
        onLoadDemo={handleLoadDemo}
      />
      <main className="main-content">
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
            isMcrSessionActive={isConnected}
            isWsServiceConnected={isWsServiceConnected}
            addMessageToHistory={addMessageToHistory}
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            fetchCurrentKb={fetchCurrentKb}
          />
        ) : (
          <SystemAnalysisMode />
        )}
      </main>
    </div>
  );
}

export default App;
