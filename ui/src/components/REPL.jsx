import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faSync } from '@fortawesome/free-solid-svg-icons';
import apiService from '../apiService';
import './REPL.css';

const REPL = ({
  sessionId,
  setSessionId,
  activeStrategy,
  setActiveStrategy,
  connectSession,
  disconnectSession,
  isMcrSessionActive,
  isWsServiceConnected,
  addMessageToHistory,
  chatHistory,
  fetchCurrentKb,
}) => {
  const [input, setInput] = useState('');
  const chatHistoryRef = useRef(null);

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSend = async () => {
    if (!input.trim()) return;
    addMessageToHistory({ type: 'user', text: input });
    setInput('');
    try {
      const response = await apiService.invokeTool('mcr.handle', {
        sessionId,
        input,
      });
      addMessageToHistory({ type: 'server', text: response.message });
    } catch (error) {
      addMessageToHistory({ type: 'error', text: error.message });
    }
  };

  return (
    <div className="repl">
      <div className="repl-header">
        <h3>REPL</h3>
        <div className="session-controls">
          {isMcrSessionActive ? (
            <button onClick={disconnectSession}>Disconnect</button>
          ) : (
            <button onClick={() => connectSession()}>New Session</button>
          )}
          <input
            type="text"
            placeholder="Session ID"
            value={sessionId || ''}
            onChange={(e) => setSessionId(e.target.value)}
          />
          <button onClick={() => connectSession(sessionId)}>Connect</button>
        </div>
      </div>
      <div className="chat-history" ref={chatHistoryRef}>
        {chatHistory.map((message, index) => (
          <div key={index} className={`message ${message.type}`}>
            {message.type === 'user' && '🧑 '}
            {message.type === 'server' && '🤖 '}
            {message.type === 'system' && '⚙️ '}
            {message.type === 'error' && '🔥 '}
            {message.text}
          </div>
        ))}
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type your message..."
        />
        <button onClick={handleSend}>
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </div>
    </div>
  );
};

export default REPL;
