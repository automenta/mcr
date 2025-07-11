import React from 'react';
import LeftSidebar from './LeftSidebar';
import MainInteraction from './MainInteraction';
import RightSidebar from './RightSidebar';
// Note: apiService, PrologCodeViewer, Modal, DirectAssertionEditor are used by children, so they will import them directly.

const InteractiveSessionMode = ({
  sessionId,
  setSessionId, // This prop seems to be passed to App's connectToSession, not directly used by InteractiveSessionMode itself or its direct children. Keep for now.
  activeStrategy,
  setActiveStrategy,
  currentKb,
  setCurrentKb,
  connectSession,
  disconnectSession,
  isMcrSessionActive,
  isWsServiceConnected,
  addMessageToHistory,
  chatHistory,
  fetchActiveStrategy, // This prop seems to be passed to App, not directly used by InteractiveSessionMode itself. Keep for now.
  fetchCurrentKb
}) => {
  return (
    <div className="app-container">
      <LeftSidebar
        sessionId={sessionId}
        activeStrategy={activeStrategy}
        setActiveStrategy={setActiveStrategy}
        connectSession={connectSession}
        disconnectSession={disconnectSession}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
        addMessageToHistory={addMessageToHistory}
      />
      <MainInteraction
          sessionId={sessionId}
          isMcrSessionActive={isMcrSessionActive}
          isWsServiceConnected={isWsServiceConnected}
          addMessageToHistory={addMessageToHistory}
          chatHistory={chatHistory}
      />
      <RightSidebar
        knowledgeBase={currentKb}
        isMcrSessionActive={isMcrSessionActive}
        sessionId={sessionId}
        fetchCurrentKb={fetchCurrentKb}
        addMessageToHistory={addMessageToHistory}
        setCurrentKb={setCurrentKb}
      />
    </div>
  );
};

export default InteractiveSessionMode;
