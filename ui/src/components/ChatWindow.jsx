import React, { useState } from 'react';
import apiService from '../apiService';
import { motion, AnimatePresence } from 'framer-motion';
import GraphVisualizer from './GraphVisualizer';
import './ChatWindow.css';

const ChatBubble = ({ message, useReasoning }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      layout
      className={`chat-bubble ${message.type}`}
    >
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ cursor: 'pointer' }}
      >
        <strong>{message.type}:</strong>{' '}
        {typeof message.text === 'object'
          ? JSON.stringify(message.text)
          : message.text}
      </div>
      {message.actions && (
        <div className="chat-actions">
          {message.actions.map((action, index) => (
            <button key={index} onClick={action.onClick}>
              {action.label}
            </button>
          ))}
        </div>
      )}
      <AnimatePresence>
        {isExpanded && useReasoning && message.graph && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginTop: '0.5rem', overflow: 'hidden', height: '200px' }}
          >
            <GraphVisualizer data={message.graph} layout="dagre" size="small" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ChatWindow = ({
  chatHistory,
  setChatHistory,
  sessionId,
  isMcrSessionActive,
  addMessageToHistory,
  useReasoning,
  setUseReasoning,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const commands = [
    {
      name: 'assert',
      description: 'Assert a new fact into the knowledge base.',
    },
    { name: 'query', description: 'Query the knowledge base.' },
    { name: 'retract', description: 'Retract a fact from the knowledge base.' },
    { name: 'session.list', description: 'List all active sessions.' },
    { name: 'strategy.list', description: 'List all available strategies.' },
    { name: 'strategy.getActive', description: 'Get the active strategy.' },
  ];

  const handleInputChange = e => {
    const value = e.target.value;
    setInputValue(value);
    if (value.startsWith('/')) {
      const search = value.substring(1);
      const filteredCommands = commands.filter(cmd =>
        cmd.name.startsWith(search)
      );
      setSuggestions(filteredCommands);
    } else {
      setSuggestions([]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    if (/\b(assert|query|retract)\b/i.test(inputValue) && !useReasoning) {
      addMessageToHistory({
        type: 'system',
        text: 'Logic detected. Would you like to enable reasoning graphs?',
        actions: [
          { label: 'Enable Graphs', onClick: () => setUseReasoning(true) },
        ],
      });
    }

    const message = {
      type: 'user',
      text: inputValue,
    };
    addMessageToHistory(message);
    setSuggestions([]);

    if (inputValue.startsWith('/')) {
      const [command, ...args] = inputValue.substring(1).split(' ');
      try {
        const response = await apiService.invokeTool(command, {
          sessionId,
          query: args.join(' '),
        });
        addMessageToHistory({
          type: 'system',
          text: `Command ${command} executed.`,
        });
        if (response.data) {
          addMessageToHistory({
            type: 'system',
            text: JSON.stringify(response.data, null, 2),
            graph: response.data.graph,
          });
        }
      } catch (error) {
        addMessageToHistory({
          type: 'system',
          text: `Error executing command: ${error.message}`,
        });
      }
    } else {
      try {
        const response = await apiService.invokeTool('session.chat', {
          sessionId,
          query: inputValue,
        });
        if (response.success && response.data) {
          addMessageToHistory({
            type: 'assistant',
            text: response.data.response,
            graph: response.data.graph,
          });
        } else {
          addMessageToHistory({
            type: 'system',
            text: `Error: ${response.message}`,
          });
        }
      } catch (error) {
        addMessageToHistory({
          type: 'system',
          text: `Error: ${error.message}`,
        });
      }
    }

    setInputValue('');
  };

  return (
    <div className="chat-window">
      <div className="chat-history">
        <AnimatePresence>
          {chatHistory.map((msg, index) => (
            <ChatBubble key={index} message={msg} useReasoning={useReasoning} />
          ))}
        </AnimatePresence>
      </div>
      <div className="chat-input-area">
        {suggestions.length > 0 && (
          <div className="suggestions-popup">
            {suggestions.map(cmd => (
              <div
                key={cmd.name}
                onClick={() => setInputValue(`/${cmd.name} `)}
                className="suggestion-item"
              >
                <strong>/{cmd.name}</strong> - {cmd.description}
              </div>
            ))}
          </div>
        )}
        <div className="input-bar">
          <textarea
            placeholder="Type a message or command..."
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={e =>
              e.ctrlKey && e.key === 'Enter' && handleSendMessage()
            }
          />
          <button onClick={handleSendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
