import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faTrash } from '@fortawesome/free-solid-svg-icons';
import apiService from '../apiService';
import './REPL.css';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import CycleViz from './CycleViz';

const REPL = ({
  sessionId,
  activeStrategy,
  isMcrSessionActive,
  addMessageToHistory,
  chatHistory,
  setChatHistory,
}) => {
  const [input, setInput] = useState('');
  const chatHistoryRef = useRef(null);
  const [useLoops, setUseLoops] = useState(true);
  const [embed, setEmbed] = useState(true);

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
        useLoops,
        embed,
      });
      if (response.success) {
        if (response.answer) {
          addMessageToHistory({
            type: 'server',
            text: response.answer,
            debugInfo: response.debugInfo,
          });
        } else if (response.response) {
          addMessageToHistory({ type: 'llm', text: response.response });
        } else {
          addMessageToHistory({
            type: 'server',
            text: response.message,
            debugInfo: response.debugInfo,
          });
        }
      } else {
        addMessageToHistory({ type: 'error', text: response.message });
      }
    } catch (error) {
      addMessageToHistory({ type: 'error', text: error.message });
    }
  };

  const handleClearHistory = () => {
    setChatHistory([]);
  };

  const renderMessage = (message, index) => {
    switch (message.type) {
      case 'user':
        return (
          <div key={index} className="message user">
            🧑 {message.text}
          </div>
        );
      case 'server':
        return (
          <div key={index} className="message server">
            🤖 {message.text}
            {message.debugInfo && <CycleViz debugInfo={message.debugInfo} />}
          </div>
        );
      case 'llm':
        return (
          <div key={index} className="message llm">
            🧠 {message.text}
          </div>
        );
      case 'system':
        return (
          <div key={index} className="message system">
            ⚙️ {message.text}
          </div>
        );
      case 'error':
        return (
          <div key={index} className="message error">
            🔥 {message.text}
          </div>
        );
      case 'demo':
        return (
          <div key={index} className="message demo">
            <h4>Demo Output</h4>
            {message.messages.map((demoMsg, i) => {
              if (demoMsg.type === 'assertion') {
                return (
                  <div
                    key={i}
                    className={`demo-log-item demo-log-assertion ${demoMsg.status ? 'success' : 'failure'}`}
                  >
                    <strong>ASSERTION {demoMsg.status ? '✅' : '❌'}</strong>:{' '}
                    {demoMsg.message}
                  </div>
                );
              }
              return (
                <div
                  key={i}
                  className={`demo-log-item demo-log-${demoMsg.level}`}
                >
                  <strong>{demoMsg.level.toUpperCase()}</strong>:{' '}
                  {demoMsg.message}
                  {demoMsg.data && (
                    <pre>{JSON.stringify(demoMsg.data, null, 2)}</pre>
                  )}
                </div>
              );
            })}
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
        <div className="repl-controls">
          <button onClick={handleClearHistory} title="Clear chat history">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </div>
      <div className="active-strategy">
        Active Strategy: <span>{activeStrategy || 'N/A'}</span>
      </div>
      <div className="chat-history" ref={chatHistoryRef}>
        {chatHistory.map((message, index) => renderMessage(message, index))}
      </div>
      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder={
            isMcrSessionActive
              ? 'Type your message...'
              : 'Connect to a session to begin'
          }
          disabled={!isMcrSessionActive}
        />
        <button onClick={handleSend} disabled={!isMcrSessionActive}>
          <FontAwesomeIcon icon={faPaperPlane} />
        </button>
      </div>
      <div className="repl-options">
        <label>
          <input
            type="checkbox"
            checked={useLoops}
            onChange={e => setUseLoops(e.target.checked)}
          />
          Use Loops
        </label>
        <label>
          <input
            type="checkbox"
            checked={embed}
            onChange={e => setEmbed(e.target.checked)}
          />
          Use Embeddings
        </label>
      </div>
    </div>
  );
};

export default REPL;
