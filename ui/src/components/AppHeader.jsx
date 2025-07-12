import React from 'react';
import './AppHeader.css';

const AppHeader = ({
  currentMode,
  setCurrentMode,
  wsConnectionStatus,
  isWsServiceConnected,
  onRetryConnect,
  sessionId,
  setSessionId,
  connectSession,
  disconnectSession,
  isMcrSessionActive,
}) => {
  return (
    <header className="app-header">
      <div className="main-menu">
        <button onClick={() => setCurrentMode('interactive')}>Interactive</button>
        <button onClick={() => setCurrentMode('analysis')}>Analysis</button>
      </div>
      <div className="session-management">
        <span>{wsConnectionStatus}</span>
        {!isWsServiceConnected && <button onClick={onRetryConnect}>Retry</button>}
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
    </header>
  );
};

export default AppHeader;
