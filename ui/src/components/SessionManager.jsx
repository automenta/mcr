import React from 'react';
import useStore from '../store';
import apiService from '../services/apiService'; // Corrected path

const SessionManager = () => {
  const { sessionId, setSessionId, addChatMessage, setIsLoading, setError } = useStore();

  const handleCreateSession = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Use the promise-based send from apiService
      const result = await apiService.send('tool_invoke', 'create_session', {}, `cs-${Date.now()}`);
      if (result.sessionId) { // result is the payload of tool_result
        setSessionId(result.sessionId);
        addChatMessage({ text: `Session created: ${result.sessionId}`, sender: 'system', type: 'info' });
      } else {
        throw new Error(result.message || 'Failed to create session: No session ID in response.');
      }
    } catch (err) {
      console.error("Create session error:", err);
      setError(err.message || 'An unknown error occurred while creating session.');
      addChatMessage({ text: `Error creating session: ${err.message}`, sender: 'system', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', marginBottom: '10px' }}>
      <h3>Session Manager</h3>
      {sessionId ? (
        <p>Current Session ID: <strong>{sessionId}</strong></p>
      ) : (
        <p>No active session.</p>
      )}
      <button onClick={handleCreateSession} disabled={useStore.getState().isLoading}>
        {useStore.getState().isLoading ? 'Creating...' : 'Create New Session'}
      </button>
      {useStore.getState().error && <p style={{ color: 'red' }}>Error: {useStore.getState().error}</p>}
    </div>
  );
};

export default SessionManager;
