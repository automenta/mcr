import React, { useEffect, useRef } from 'react';
import useStore from '../store';

const ChatHistory = () => {
  const chatMessages = useStore((state) => state.chatMessages);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [chatMessages]);

  const getMessageStyle = (sender)_getM => {
    let baseStyle = {
      padding: '8px 12px',
      borderRadius: '10px',
      marginBottom: '8px',
      maxWidth: '80%',
      wordWrap: 'break-word',
      fontSize: '0.9rem',
    };
    if (sender === 'user') {
      return {
        ...baseStyle,
        backgroundColor: '#007bff', // Blue for user
        color: 'white',
        marginLeft: 'auto',
        borderBottomRightRadius: '0px',
      };
    } else if (sender === 'mcr') {
      return {
        ...baseStyle,
        backgroundColor: '#e9ecef', // Light grey for MCR
        color: '#333',
        marginRight: 'auto',
        borderBottomLeftRadius: '0px',
      };
    } else if (sender === 'system') {
       return {
        ...baseStyle,
        backgroundColor: 'transparent',
        color: '#aaa', // Grey for system messages
        fontSize: '0.8rem',
        textAlign: 'center',
        width: '100%',
        maxWidth: '100%',
        fontStyle: 'italic',
        margin: '10px 0'
      };
    }
    return baseStyle; // Default
  };

  const getSenderLabel = (sender, type) => {
    if (sender === 'user') return `You (${type || ''}):`;
    if (sender === 'mcr') return 'MCR:';
    if (sender === 'system') return (type === 'error' ? 'System Error:' : 'System:');
    return 'Unknown:';
  }

  return (
    <div style={{
      height: '400px',
      overflowY: 'auto',
      border: '1px solid #444',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#282c34' // Darker background for chat area
    }}>
      {chatMessages.map((msg, index) => (
        <div key={msg.id || index} style={getMessageStyle(msg.sender)}>
          <strong style={{display: msg.sender === 'system' ? 'none': 'block', marginBottom: '3px'}}>
            {getSenderLabel(msg.sender, msg.type)}
          </strong>
          {msg.text}
          {msg.prolog && (
            <details style={{marginTop: '5px', fontSize: '0.8em', opacity: 0.8}}>
              <summary>Prolog Details</summary>
              <pre style={{whiteSpace: 'pre-wrap', backgroundColor: '#333', padding: '5px', borderRadius: '4px'}}>
                {typeof msg.prolog === 'object' ? JSON.stringify(msg.prolog, null, 2) : msg.prolog}
              </pre>
            </details>
          )}
           {msg.reasonerResults && (
            <details style={{marginTop: '5px', fontSize: '0.8em', opacity: 0.8}}>
              <summary>Reasoner Results</summary>
              <pre style={{whiteSpace: 'pre-wrap', backgroundColor: '#333', padding: '5px', borderRadius: '4px'}}>
                {JSON.stringify(msg.reasonerResults, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatHistory;
