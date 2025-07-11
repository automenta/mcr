import React, { useEffect } from 'react'; // Removed useState
// import apiService from '../../apiService'; // apiService calls will be in child panels mostly
import SessionPanel from './SessionPanel';
import OntologyPanel from './OntologyPanel';
import DemoPanel from './DemoPanel';
import StrategyPanel from './StrategyPanel';
// import Modal from '../Modal'; // Modal for strategies is now in StrategyPanel - No longer needed here
// import PrologCodeViewer from '../PrologCodeViewer'; // No longer directly used by LeftSidebar
import DirectAssertionEditor from '../DirectAssertionEditor';

const LeftSidebar = ({ sessionId, activeStrategy, setActiveStrategy, connectSession, disconnectSession, isMcrSessionActive, isWsServiceConnected, addMessageToHistory }) => {
  // const [ontologies, setOntologies] = useState([]); // Moved to OntologyPanel
  // const [demos, setDemos] = useState([]); // Moved to DemoPanel
  // const [strategies, setStrategies] = useState([]); // Moved to StrategyPanel
  // const [tempSessionId, setTempSessionId] = useState(sessionId || ''); // Moved to SessionPanel

  // State for Modals
  // const [isOntologyModalOpen, setIsOntologyModalOpen] = useState(false); // Moved to OntologyPanel
  // const [selectedOntologyContent, setSelectedOntologyContent] = useState({ name: '', rules: '' }); // Moved to OntologyPanel
  // const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false); // Moved to StrategyPanel
  // const [selectedStrategyContent, setSelectedStrategyContent] = useState({ name: '', description: '', definition: null }); // Moved to StrategyPanel


  useEffect(() => {
    // This useEffect is likely no longer needed as each panel manages its own data loading.
    // If LeftSidebar had specific logic dependent on session status not covered by panels, it would go here.
    // console.log('[LeftSidebar] Session status check:', { sessionId, isMcrSessionActive, isWsServiceConnected });
  }, [sessionId, isMcrSessionActive, isWsServiceConnected]);

  // All event handlers (handleConnect, handleListDemos, handleRunDemo, listOntologies, etc.)
  // and their related state (tempSessionId, ontologies, demos, strategies, modal states)
  // have been moved to their respective panel components.
  // LeftSidebar now primarily passes props.

  return (
    <div className="sidebar left-sidebar">
      <h3>⚙️ Config & Context</h3>
      <SessionPanel
        initialSessionId={sessionId}
        connectSession={connectSession}
        disconnectSession={disconnectSession}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
      />
      <hr />
      <OntologyPanel
        sessionId={sessionId}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
        addMessageToHistory={addMessageToHistory}
      />
      <hr />
      <DemoPanel
        sessionId={sessionId}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
        addMessageToHistory={addMessageToHistory}
      />
      <hr />
      <StrategyPanel
        sessionId={sessionId}
        activeStrategy={activeStrategy}
        setActiveStrategy={setActiveStrategy}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
        addMessageToHistory={addMessageToHistory}
      />
      {/* Strategy Modal is now inside StrategyPanel */}
      <hr />
      <DirectAssertionEditor
        sessionId={sessionId}
        isMcrSessionActive={isMcrSessionActive}
        isWsServiceConnected={isWsServiceConnected}
        addMessageToHistory={addMessageToHistory}
      />
    </div>
  );
};

export default LeftSidebar;
