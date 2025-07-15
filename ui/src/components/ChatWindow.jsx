import React, { useState } from 'react';
import apiService from '../apiService';
import GraphVisualizer from './GraphVisualizer';
import { motion, AnimatePresence } from 'framer-motion';

const ChatBubble = ({ message }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      layout
      style={{ border: '1px solid #eee', padding: '0.5rem', margin: '0.5rem 0', borderRadius: '5px' }}
    >
      <div onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer' }}>
        <strong>{message.type}:</strong> {typeof message.text === 'object' ? JSON.stringify(message.text) : message.text}
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ marginTop: '0.5rem', overflow: 'hidden' }}
          >
            <GraphVisualizer data={message.graph || { nodes: [], edges: [] }} layout="grid" size="small" />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const ChatWindow = ({ chatHistory, setChatHistory, sessionId, isMcrSessionActive, addMessageToHistory, useReasoning }) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);

  const commands = [
    { name: 'assert', description: 'Assert a new fact into the knowledge base.' },
    { name: 'query', description: 'Query the knowledge base.' },
    { name: 'retract', description: 'Retract a fact from the knowledge base.' },
    { name: 'session.list', description: 'List all active sessions.' },
    { name: 'strategy.list', description: 'List all available strategies.' },
    { name: 'strategy.getActive', description: 'Get the active strategy.' },
  ];

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    if (value.startsWith('/')) {
      const search = value.substring(1);
      const filteredCommands = commands.filter((cmd) => cmd.name.startsWith(search));
      setSuggestions(filteredCommands);
    } else {
      setSuggestions([]);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const message = {
      type: 'user',
      text: inputValue,
    };
    addMessageToHistory(message);
    setSuggestions([]);

    if (inputValue.startsWith('/')) {
      const [command, ...args] = inputValue.substring(1).split(' ');
      try {
        const response = await apiService.invokeTool(command, { sessionId, query: args.join(' ') });
        addMessageToHistory({ type: 'system', text: `Command ${command} executed.` });
        if (response.data) {
          addMessageToHistory({ type: 'system', text: JSON.stringify(response.data, null, 2), graph: response.data.graph });
        }
      } catch (error) {
        addMessageToHistory({ type: 'system', text: `Error executing command: ${error.message}` });
      }
    } else {
      try {
        const response = await apiService.invokeTool('session.chat', { sessionId, query: inputValue });
        if (response.success && response.data) {
          addMessageToHistory({ type: 'assistant', text: response.data.response, graph: response.data.graph });
        } else {
          addMessageToHistory({ type: 'system', text: `Error: ${response.message}` });
        }
      } catch (error) {
        addMessageToHistory({ type: 'system', text: `Error: ${error.message}` });
      }
    }

    setInputValue('');
  };

  return (
    <div style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column' }}>
      <h2>{useReasoning ? 'Neuro-Symbolic Chat' : 'Pure Language Model Chat'}</h2>
      <div style={{ flex: 1, overflowY: 'scroll', border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
        <AnimatePresence>
          {chatHistory.map((msg, index) => (
            <ChatBubble key={index} message={msg} />
          ))}
        </AnimatePresence>
      </div>
      <div style={{ position: 'relative' }}>
        {suggestions.length > 0 && (
          <div style={{ border: '1px solid #ccc', borderRadius: '5px', padding: '0.5rem', background: 'white', position: 'absolute', bottom: '100%', left: 0, right: 0 }}>
            {suggestions.map((cmd) => (
              <div key={cmd.name} onClick={() => setInputValue(`/${cmd.name} `)} style={{ cursor: 'pointer', padding: '0.25rem' }}>
                <strong>/{cmd.name}</strong> - {cmd.description}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex' }}>
          <input
            type="text"
            placeholder="Type a message or command..."
            style={{ flex: 1, padding: '0.5rem' }}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button onClick={handleSendMessage} style={{ padding: '0.5rem' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
