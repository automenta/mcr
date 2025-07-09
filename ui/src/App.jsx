import React, { useEffect } from 'react';
import './App.css'; // Will create this if it's missing, or ensure it has basic styles
import useStore from './store';
import apiService from './services/apiService';
import SessionManager from './components/SessionManager';
import ChatHistory from './components/ChatHistory';
import ChatInput from './components/ChatInput';
import KnowledgeBaseViewer from './components/KnowledgeBaseViewer';

function App() {
  const {
    isConnected,
    setIsConnected,
    setSessionId,
    addChatMessage,
    setCurrentKb,
    setNewFactsInLastUpdate,
    setError
  } = useStore();

  useEffect(() => {
    if (!apiService.ws || (apiService.ws.readyState !== WebSocket.OPEN && apiService.ws.readyState !== WebSocket.CONNECTING)) {
      apiService.connect();
    }

    const unsubs = [
      apiService.on('open', () => {
        setIsConnected(true);
        addChatMessage({ id: 'sys-conn', text: 'Connected to MCR server.', sender: 'system', type: 'info' });
      }),
      apiService.on('close', ({ reason, code }) => {
        setIsConnected(false);
        addChatMessage({ id: 'sys-disconn', text: `Disconnected from MCR server. Code: ${code}, Reason: ${reason || 'N/A'}`, sender: 'system', type: 'error' });
      }),
      apiService.on('error', (errorEventOrMessage) => {
        const message = errorEventOrMessage.message || (typeof errorEventOrMessage === 'string' ? errorEventOrMessage : 'WebSocket connection error');
        console.error('WebSocket error in App:', errorEventOrMessage);
        addChatMessage({ id: `sys-wserr-${Date.now()}`, text: `WebSocket error: ${message}`, sender: 'system', type: 'error' });
        setError(message);
      }),
      apiService.on('server_error', (payload) => {
        addChatMessage({ id: `sys-serverr-${Date.now()}`, text: `Server error: ${payload.message}`, sender: 'system', type: 'error' });
        setError(payload.message);
      }),
      apiService.on('connection_ack', (ack) => {
         addChatMessage({ id: 'sys-ack', text: ack.message || 'Connection Acknowledged.', sender: 'system', type: 'info' });
      }),
      apiService.onToolResult((toolResultMessage) => {
        console.log('Received general tool_result in App.jsx:', toolResultMessage);
        const { payload, correlationId } = toolResultMessage;

        if (payload.success) {
          if (payload.answer) { // From query_session
            addChatMessage({
              id: correlationId || `mcr-resp-${Date.now()}`,
              text: payload.answer,
              sender: 'mcr',
              type: 'response',
              prolog: payload.debugInfo?.prologQuery,
              reasonerResults: payload.debugInfo?.prologResultsJSON ? JSON.parse(payload.debugInfo.prologResultsJSON) : null
            });
          } else if (payload.addedFacts) { // From assert_facts_to_session
             addChatMessage({
              id: correlationId || `mcr-assert-${Date.now()}`,
              text: payload.message || 'Facts asserted.',
              sender: 'mcr',
              type: 'response',
              prolog: payload.addedFacts.join('\\n')
            });
          } else if (payload.message && !payload.sessionId && correlationId && !correlationId.startsWith('cs-')) {
            // Generic success, not create_session (handled by component)
             addChatMessage({ id: correlationId || `mcr-info-${Date.now()}`, text: payload.message, sender: 'mcr', type: 'info' });
          }
        } else {
           addChatMessage({ id: correlationId || `mcr-err-${Date.now()}`, text: `Operation failed: ${payload.message || 'Unknown error'}`, sender: 'system', type: 'error', prolog: payload.details });
        }
      }),
      apiService.onKbUpdate((payload) => {
        setCurrentKb(payload.fullKnowledgeBase);
        setNewFactsInLastUpdate(payload.newFacts || []);
      })
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [setIsConnected, setSessionId, addChatMessage, setCurrentKb, setNewFactsInLastUpdate, setError, isConnected]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#1e1e1e', color: '#d4d4d4' }}>
      <header style={{ padding: '10px 20px', backgroundColor: '#333', borderBottom: '1px solid #555', textAlign: 'center' }}>
        <h1>MCR Workbench</h1>
        <p style={{fontSize: '0.9em', color: isConnected ? 'lightgreen' : 'lightcoral', margin: 0}}>
          Connection Status: {isConnected ? 'Connected' : 'Disconnected'}
        </p>
      </header>
      <div style={{ display: 'flex', flexGrow: 1, flexDirection: 'row', padding: '10px', gap: '10px', overflow: 'hidden' }}>
        <div style={{ flex: 1, backgroundColor: '#252526', border: '1px solid #333', padding: '10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{textAlign: 'center', marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px'}}>Configuration</h2>
          <SessionManager />
        </div>

        <div style={{ flex: 2, backgroundColor: '#252526', border: '1px solid #333', padding: '10px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{textAlign: 'center', marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px'}}>Interactive Session</h2>
          <ChatHistory />
          <ChatInput />
        </div>

        <div style={{ flex: 1.5, backgroundColor: '#252526', border: '1px solid #333', padding: '10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h2 style={{textAlign: 'center', marginTop: 0, borderBottom: '1px solid #444', paddingBottom: '10px'}}>Live State Viewer</h2>
          <KnowledgeBaseViewer />
        </div>
      </div>
    </div>
  );
}

export default App;
