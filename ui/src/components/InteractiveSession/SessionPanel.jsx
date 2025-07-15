// ui/src/components/InteractiveSession/SessionPanel.jsx
import React, { useState, useEffect } from 'react';

const CycleVisualization = ({ steps }) => {
  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <div
      style={{ marginTop: '1rem', padding: '0.5rem', border: '1px solid #ccc' }}
    >
      <h5>Cycle Steps</h5>
      {steps.map((step, index) => (
        <div key={index} style={{ marginBottom: '0.5rem' }}>
          <p>
            <strong>Step {index + 1}:</strong> {step.action}
          </p>
          {step.probability && (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <p style={{ marginRight: '0.5rem' }}>Probability:</p>
              <div
                style={{
                  width: '100%',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '4px',
                }}
              >
                <div
                  style={{
                    width: `${step.probability * 100}%`,
                    backgroundColor: '#76c7c0',
                    height: '20px',
                    borderRadius: '4px',
                  }}
                ></div>
              </div>
              <p style={{ marginLeft: '0.5rem' }}>
                {(step.probability * 100).toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const SessionPanel = ({
  initialSessionId, // Renamed from sessionId to avoid confusion with internal state if any
  connectSession,
  disconnectSession,
  isMcrSessionActive,
  isWsServiceConnected,
  cycleSteps,
}) => {
  const [tempSessionIdInput, setTempSessionIdInput] = useState(
    initialSessionId || ''
  );

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <input
          type="text"
          value={tempSessionIdInput}
          onChange={e => setTempSessionIdInput(e.target.value)}
          placeholder="Session ID (optional)"
          disabled={isMcrSessionActive || !isWsServiceConnected}
          style={{ flexGrow: 1, marginRight: '5px' }}
        />
        {!isMcrSessionActive ? (
          <button
            onClick={handleConnect}
            disabled={!isWsServiceConnected}
            title="Connect or Create Session"
          >
            🟢 Connect
          </button>
        ) : (
          <button
            onClick={disconnectSession}
            disabled={!isWsServiceConnected}
            title="Disconnect Session"
          >
            🔴 Disconnect
          </button>
        )}
      </div>
      {isMcrSessionActive && initialSessionId && (
        <p className="text-muted">🔑 Active Session: {initialSessionId}</p>
      )}
      <CycleVisualization steps={cycleSteps} />
    </div>
  );
};

export default SessionPanel;
