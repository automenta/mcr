import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBars,
  faTimes,
  faPlayCircle,
  faPlug,
  faServer,
  faVial,
  faBrain,
} from '@fortawesome/free-solid-svg-icons';
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
  demos,
  selectedDemo,
  setSelectedDemo,
  onLoadDemo,
  useReasoning,
  setUseReasoning,
  isSidebarOpen,
  setIsSidebarOpen,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleDemoSelect = (demoId) => {
    setSelectedDemo(demoId);
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="menu-toggle" style={{marginRight: "10px"}}>
            <FontAwesomeIcon icon={isSidebarOpen ? faTimes : faBars} />
          </button>
          <FontAwesomeIcon icon={faPlayCircle} /> MCR
        </div>
        <nav className="main-nav">
          <button
            onClick={() => setCurrentMode('interactive')}
            className={currentMode === 'interactive' ? 'active' : ''}
          >
            Interactive
          </button>
          <button
            onClick={() => setCurrentMode('analysis')}
            className={currentMode === 'analysis' ? 'active' : ''}
          >
            Analysis
          </button>
        </nav>
      </div>

      <div className="header-right">
        <button
            onClick={() => setUseReasoning(!useReasoning)}
            className={`reasoning-toggle ${useReasoning ? 'active' : ''}`}
            title="Toggle Reasoning Graphs"
        >
            <FontAwesomeIcon icon={faBrain} />
        </button>
        <div className="session-controls">
          <FontAwesomeIcon
            icon={faServer}
            title={wsConnectionStatus}
            className={`status-icon ${isWsServiceConnected ? 'connected' : 'disconnected'}`}
          />
          <input
            type="text"
            placeholder="Session ID"
            value={sessionId || ''}
            onChange={(e) => setSessionId(e.target.value)}
            className="session-input"
          />
          {isMcrSessionActive ? (
            <button onClick={disconnectSession} className="session-button">
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => connectSession(sessionId)}
              className="session-button"
            >
              Connect
            </button>
          )}
          {!isMcrSessionActive && (
            <button onClick={() => connectSession()} className="session-button">
              New
            </button>
          )}
        </div>

        <div className="mobile-menu">
          <button onClick={toggleMenu} className="menu-toggle">
            <FontAwesomeIcon icon={isMenuOpen ? faTimes : faBars} />
          </button>
          {isMenuOpen && (
            <div className="dropdown-menu">
              <div className="dropdown-section">
                <h3>
                  <FontAwesomeIcon icon={faVial} /> Demos
                </h3>
                <select
                  value={selectedDemo || ''}
                  onChange={(e) => handleDemoSelect(e.target.value)}
                  disabled={!isMcrSessionActive}
                >
                  <option value="" disabled>
                    Select a demo
                  </option>
                  {demos.map((demo) => (
                    <option key={demo.id} value={demo.id}>
                      {demo.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => onLoadDemo(selectedDemo)}
                  disabled={!selectedDemo || !isMcrSessionActive}
                >
                  Load Demo
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
