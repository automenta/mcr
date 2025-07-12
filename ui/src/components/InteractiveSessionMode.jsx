import React from 'react';
import Split from 'react-split';
import KnowledgeBase from './KnowledgeBase';
import REPL from './REPL';
import './InteractiveSessionMode.css';

const InteractiveSessionMode = ({
  sessionId,
  setSessionId,
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
  fetchCurrentKb,
}) => {
  return (
    <Split
      className="split"
      sizes={[50, 50]}
      minSize={200}
      gutterSize={10}
      direction="horizontal"
    >
      <div className="repl-container">
        <REPL
          sessionId={sessionId}
          setSessionId={setSessionId}
          activeStrategy={activeStrategy}
          setActiveStrategy={setActiveStrategy}
          connectSession={connectSession}
          disconnectSession={disconnectSession}
          isMcrSessionActive={isMcrSessionActive}
          isWsServiceConnected={isWsServiceConnected}
          addMessageToHistory={addMessageToHistory}
          chatHistory={chatHistory}
          fetchCurrentKb={fetchCurrentKb}
        />
      </div>
      <div className="kb-container">
        <KnowledgeBase currentKb={currentKb} />
      </div>
    </Split>
  );
};

export default InteractiveSessionMode;
