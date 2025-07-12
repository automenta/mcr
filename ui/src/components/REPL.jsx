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

  const renderMessage = (message, index) => {
    switch (message.type) {
      case 'user':
        return <div key={index} className="message user">🧑 {message.text}</div>;
      case 'server':
        return <div key={index} className="message server">🤖 {message.text}</div>;
      case 'system':
        return <div key={index} className="message system">⚙️ {message.text}</div>;
      case 'error':
        return <div key={index} className="message error">🔥 {message.text}</div>;
      case 'demo':
        return (
          <div key={index} className="message demo">
            <h4>Demo Output</h4>
            {message.messages.map((demoMsg, i) => (
              <div key={i} className={`demo-log-item demo-log-${demoMsg.level}`}>
                <strong>{demoMsg.level.toUpperCase()}</strong>: {demoMsg.message}
                {demoMsg.data && <pre>{JSON.stringify(demoMsg.data, null, 2)}</pre>}
              </div>
            ))}
          </div>
        );
      default:
        return null;
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
        {chatHistory.map((message, index) => renderMessage(message, index))}
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
