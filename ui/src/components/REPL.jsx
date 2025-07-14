import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faTrash } from '@fortawesome/free-solid-svg-icons';
import apiService from '../apiService';
import StrategySelector from './StrategySelector';
import MessageDetailsModal from './MessageDetailsModal';
import './REPL.css';

const REPL = ({
  sessionId,
  isMcrSessionActive,
  addMessageToHistory,
  chatHistory,
  setChatHistory,
  activeStrategy,
  setActiveStrategy,
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
      });
      if (response.success) {
        if (response.answer) {
          addMessageToHistory({ type: 'server', text: response.answer, ...response });
        } else if (response.response) {
          addMessageToHistory({ type: 'llm', text: response.response, ...response });
        } else {
          addMessageToHistory({ type: 'server', text: response.message, ...response });
        }
      } else {
        addMessageToHistory({ type: 'error', text: response.message, ...response });
      }
    } catch (error) {
      addMessageToHistory({ type: 'error', text: error.message });
    }
  };

  const handleClearHistory = () => {
    setChatHistory([]);
  };

  const handleMessageClick = (message) => {
    setSelectedMessage(message);
  };

  const renderMessage = (message, index) => {
    const messageClass = `message ${message.type}`;
    return (
      <div key={index} className={messageClass} onClick={() => handleMessageClick(message)}>
        {message.type === 'user' && '🧑'}
        {message.type === 'server' && '🤖'}
        {message.type === 'llm' && '🧠'}
        {message.type === 'system' && '⚙️'}
        {message.type === 'error' && '🔥'}
        {message.text}
      </div>
    );
  };

  return (
    <div className="repl">
      <div className="repl-header">
        <div className="repl-controls">
          <button onClick={handleClearHistory} title="Clear chat history">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </div>
      <div className="chat-history" ref={chatHistoryRef}>
        {chatHistory.map((message, index) => renderMessage(message, index))}
      </div>
      <div className="input-area">
        <StrategySelector
          activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy}
        />
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
      <MessageDetailsModal
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
      />
    </div>
  );
};

export default REPL;
