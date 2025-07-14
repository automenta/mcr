import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import apiService from '../apiService';
import MessagePopup from './MessagePopup';
import './REPL.css';

const REPL = ({
  sessionId,
  activeStrategy,
  setActiveStrategy,
  strategies,
  isMcrSessionActive,
  addMessageToHistory,
  chatHistory,
}) => {
  const [input, setInput] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);
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
        naturalLanguageText: input,
        activeStrategy,
      });
      if (response.success) {
        if (response.answer) {
          addMessageToHistory({ type: 'server', text: response.answer });
        } else if (response.response) {
          addMessageToHistory({ type: 'llm', text: response.response });
        } else {
          addMessageToHistory({ type: 'server', text: response.message });
        }
      } else {
        addMessageToHistory({ type: 'error', text: response.message });
      }
    } catch (error) {
      addMessageToHistory({ type: 'error', text: error.message });
    }
  };

  const handleMessageClick = (message) => {
    setSelectedMessage(message);
  };

  const renderMessage = (message, index) => {
    const messageClass = `message ${message.type}`;
    const icon = {
      user: '🧑',
      server: '🤖',
      llm: '🧠',
      system: '⚙️',
      error: '🔥',
      demo: '🚀',
    }[message.type];

    return (
      <div key={index} className={messageClass} onClick={() => handleMessageClick(message)}>
        <span className="icon">{icon}</span>
        <span className="text">{message.text}</span>
      </div>
    );
  };

  return (
    <div className="repl">
        <MessagePopup message={selectedMessage} onClose={() => setSelectedMessage(null)} />
      <div className="repl-header">
        <div className="repl-controls">
        </div>
      </div>
      <div className="active-strategy">
        <select
            value={activeStrategy || ''}
            onChange={(e) => setActiveStrategy(e.target.value)}
            disabled={!isMcrSessionActive}
        >
            <option value="" disabled>Select a strategy</option>
            {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                </option>
            ))}
        </select>
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
          placeholder={isMcrSessionActive ? "Type your message..." : "Connect to a session to begin"}
          disabled={!isMcrSessionActive}
        />
        <button onClick={handleSend} disabled={!isMcrSessionActive}>
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </div>
    </div>
  );
};

export default REPL;
