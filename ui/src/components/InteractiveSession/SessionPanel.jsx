// ui/src/components/InteractiveSession/SessionPanel.jsx
import React, { useState, useEffect } from 'react';

const SessionPanel = ({
  initialSessionId, // Renamed from sessionId to avoid confusion with internal state if any
  connectSession,
  disconnectSession,
  isMcrSessionActive,
  isWsServiceConnected,
}) => {
  const [tempSessionIdInput, setTempSessionIdInput] = useState(initialSessionId || '');

  useEffect(() => {
    setTempSessionIdInput(initialSessionId || '');
  }, [initialSessionId]);

  const handleConnect = () => {
    if (tempSessionIdInput.trim()) {
      connectSession(tempSessionIdInput.trim());
    } else {
      connectSession(); // Create new if empty
    }
  };

  return (
    <div>
      <h4>🔌 Session Management</h4>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
        <input
          type="text"
          value={tempSessionIdInput}
          onChange={(e) => setTempSessionIdInput(e.target.value)}
          placeholder="Session ID (optional)"
          disabled={isMcrSessionActive || !isWsServiceConnected}
          style={{ flexGrow: 1, marginRight: '5px' }}
        />
        {!isMcrSessionActive ? (
          <button onClick={handleConnect} disabled={!isWsServiceConnected} title="Connect or Create Session">
            🟢 Connect
          </button>
        ) : (
          <button onClick={disconnectSession} disabled={!isWsServiceConnected} title="Disconnect Session">
            🔴 Disconnect
          </button>
        )}
      </div>
      {isMcrSessionActive && initialSessionId && <p className="text-muted">🔑 Active Session: {initialSessionId}</p>}
    </div>
  );
};

export default SessionPanel;
