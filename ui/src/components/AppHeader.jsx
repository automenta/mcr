// ui/src/components/AppHeader.jsx
import React from 'react';

function AppHeader({
  currentMode,
  setCurrentMode,
  wsConnectionStatus,
  isWsServiceConnected,
  onRetryConnect, // Callback to initiate WS reconnection
}) {
  return (
    <div className="app-header">
      <div className="app-mode-switcher">
        <button
          onClick={() => setCurrentMode('interactive')}
          disabled={currentMode === 'interactive'}
        >
          💬 Interactive Session
        </button>
        <button
          onClick={() => setCurrentMode('analysis')}
          disabled={currentMode === 'analysis'}
        >
          📊 System Analysis
        </button>
      </div>
      <div className="ws-status" title={`WebSocket Connection: ${wsConnectionStatus}`}>
        {wsConnectionStatus}
        {!isWsServiceConnected && wsConnectionStatus?.startsWith('🔴 Error') && (
          <button onClick={onRetryConnect} style={{ marginLeft: '10px' }}>
            🔄 Retry
          </button>
        )}
      </div>
    </div>
  );
}

export default AppHeader;
