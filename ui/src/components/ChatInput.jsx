import React, { useState } from 'react';
import useStore from '../store';
import apiService from '../services/apiService'; // Corrected path

const ChatInput = () => {
  const [text, setText] = useState('');
  const [inputType, setInputType] = useState('heuristic'); // 'heuristic', 'assert', 'query'
  const { sessionId, addChatMessage, setIsLoading, setError } = useStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || !sessionId) {
      if (!sessionId) {
        addChatMessage({ text: 'Cannot send message: No active session. Please create one.', sender: 'system', type: 'error' });
      }
      return;
    }

    setIsLoading(true);
    setError(null);

    let determinedToolName;
    let messageType; // For chat history: 'assert' or 'query'

    if (inputType === 'assert') {
        determinedToolName = 'assert_facts_to_session';
        messageType = 'assert';
    } else if (inputType === 'query') {
        determinedToolName = 'query_session';
        messageType = 'query';
    } else { // heuristic
        // Simple heuristic: ends with '?' is a query, otherwise an assertion.
        if (text.trim().endsWith('?')) {
            determinedToolName = 'query_session';
            messageType = 'query';
        } else {
            determinedToolName = 'assert_facts_to_session';
            messageType = 'assert';
        }
    }

    const inputPayload = {
      sessionId: sessionId,
      ...(determinedToolName === 'query_session' ? { naturalLanguageQuestion: text } : { naturalLanguageText: text })
    };

    addChatMessage({ text: text, sender: 'user', type: messageType });

    try {
      const result = await apiService.send('tool_invoke', determinedToolName, inputPayload, `msg-${Date.now()}`);
      // The actual response (NL answer for query, confirmation for assert) will be added to chatMessages
      // by the App.jsx listener for 'tool_result'.
      // Here, we mainly handle if the send itself or the immediate tool_result indicates a failure.
      if (!result.success) {
         addChatMessage({ text: `Failed to ${messageType}: ${result.message || 'Unknown error'}`, sender: 'system', type: 'error', prolog: result.details });
      }
      // Successful assertions will trigger a kb_updated event, handled in App.jsx
      // Successful queries will have 'answer' in result, also handled in App.jsx by tool_result listener
    } catch (err) {
      console.error(`Error sending ${messageType}:`, err);
      setError(err.message || `An unknown error occurred during ${messageType}.`);
      addChatMessage({ text: `Error sending ${messageType}: ${err.message}`, sender: 'system', type: 'error' });
    } finally {
      setIsLoading(false);
      setText(''); // Clear input field
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
      <select value={inputType} onChange={(e) => setInputType(e.target.value)} style={{padding: '5px'}}>
        <option value="heuristic">Heuristic</option>
        <option value="assert">Assert</option>
        <option value="query">Query</option>
      </select>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={sessionId ? "Type your message..." : "Create a session first"}
        disabled={!sessionId || useStore.getState().isLoading}
        style={{ flexGrow: 1, padding: '8px', border: '1px solid #555' }}
      />
      <button type="submit" disabled={!sessionId || useStore.getState().isLoading || !text.trim()} style={{padding: '8px 15px'}}>
        {useStore.getState().isLoading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
};

export default ChatInput;
