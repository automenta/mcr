import React, { useState } from 'react'; // Removed useRef
import apiService from '../apiService';
import PrologCodeViewer from './PrologCodeViewer';

// --- Direct KB Assertion Component ---
// Uses PrologCodeViewer for consistent editor experience.
const DirectAssertionEditor = ({ sessionId, isMcrSessionActive, isWsServiceConnected, addMessageToHistory }) => {
  const [currentPrologCode, setCurrentPrologCode] = useState('');
  const [assertionStatus, setAssertionStatus] = useState({ message: '', type: '' });
  // const prologViewerRef = useRef(); // Removed as it's not used

  // Callback for PrologCodeViewer's onSave, which we'll use as "Assert"
  const handleAssertToKb = async (codeToAssert) => {
    setCurrentPrologCode(codeToAssert); // Keep local state in sync if needed, or rely on viewer's internal state
    setAssertionStatus({ message: '', type: '' });

    if (!isMcrSessionActive || !sessionId || !isWsServiceConnected) {
      const errorMsg = '⚠️ Cannot assert: No active MCR session or WebSocket connection.';
      addMessageToHistory({ type: 'system', text: errorMsg }); // Log to main chat.
      setAssertionStatus({ message: errorMsg, type: 'error' }); // Show local feedback.
      return;
    }
    if (!codeToAssert.trim()) {
      const errorMsg = '⚠️ Cannot assert: Prolog code is empty.';
      addMessageToHistory({ type: 'system', text: errorMsg });
      setAssertionStatus({ message: errorMsg, type: 'error' });
      return;
    }

    const systemMessage = `✏️ Asserting to KB via Direct Editor: \n${codeToAssert}`;
    addMessageToHistory({ type: 'system', text: systemMessage });
    setAssertionStatus({ message: '⏳ Asserting...', type: 'info' });

    try {
      const response = await apiService.invokeTool('session.assert_rules', {
        sessionId: sessionId,
        rules: codeToAssert,
      });

      if (response.success) {
        const successMsg = '✅ Prolog asserted successfully. KB updated.';
        addMessageToHistory({ type: 'system', text: successMsg });
        setAssertionStatus({ message: successMsg, type: 'success' });
        setCurrentPrologCode(''); // Clear the content for next assertion
        // The PrologCodeViewer itself will need to be told to clear its content.
        // This can be done by changing its `initialContent` prop or by calling a method on it if exposed.
        // For now, we'll rely on changing a key for PrologCodeViewer to force re-mount or update doc.
        // This is a common pattern when direct manipulation of child's CodeMirror is complex.
        // However, since PrologCodeViewer's useEffect for !isEditable updates on `code` prop,
        // and for editable, it uses `initialContent` for setup, we might need to pass `code`
        // and update it, or give PrologCodeViewer a key that changes.
        // Simpler: if PrologCodeViewer takes `code` prop and updates its internal doc when `code` changes,
        // setting currentPrologCode here and passing it as `code` prop to PrologCodeViewer would work.
        // Let's assume PrologCodeViewer is primarily controlled by its `initialContent` for editable mode,
        // and we need a way to reset it. The easiest is to change its `key` prop to force a re-render.
        // Or, we modify PrologCodeViewer to accept a `doc` prop and an `onDocChange` for full control.
        // For now, let's set currentPrologCode and expect PrologCodeViewer to reflect it if `key` changes.
        // The `PrologCodeViewer`'s `currentCode` state is internal.
        // A better way: pass `currentPrologCode` as `code` to `PrologCodeViewer` and have an `onChange` handler.
        // For now, let's rely on a key change if this doesn't clear automatically.
        // The current PrologCodeViewer updates based on `initialContent` or `code` in its useEffect.
        // If we pass `currentPrologCode` as `initialContent` (or `code`) and then change `currentPrologCode` to '',
        // the viewer should update if its `useEffect` dependencies are set correctly.
        // The current setup is: `initialContent` is used once. `code` is used for read-only updates.
        // Let's pass `currentPrologCode` as `code` to PrologCodeViewer for editable mode too,
        // and handle updates via `onSave` which already gives us the latest code.
      } else {
        // Handle assertion failure reported by the backend.
        const errorMsg = `❌ Error asserting Prolog: ${response.message || response.error || 'Unknown error'}`;
        addMessageToHistory({ type: 'system', text: errorMsg });
        setAssertionStatus({ message: errorMsg, type: 'error' });
      }
    } catch (error) {
      // Handle exceptions during the API call.
      const errorMsg = `❌ Exception asserting Prolog: ${error.message}`;
      addMessageToHistory({ type: 'system', text: errorMsg });
      setAssertionStatus({ message: errorMsg, type: 'error' });
      console.error("Exception asserting Prolog:", error);
    }
  };

  return (
    <div>
      <h4>✏️ Direct KB Assertion</h4>
      <p className="text-muted" style={{fontSize: '0.8em', marginBottom: '5px'}}>
        Enter Prolog facts or rules (e.g., <code>father(john,pete).</code>). Each statement must end with a period.
        Use the &quot;💾 Save&quot; button below the editor (or Ctrl/Cmd+S) to assert.
      </p>
      <PrologCodeViewer
        // ref={prologViewerRef} // Removed as it's not defined and not strictly needed
        key={currentPrologCode === '' ? 'empty' : 'filled'} // Force re-render with new doc if we clear currentPrologCode
        initialContent={currentPrologCode} // Set initial content, and when it changes (e.g. cleared), re-key
        isEditable={true}
        onSave={handleAssertToKb} // This is our "Assert to KB" action
        addMessageToHistory={addMessageToHistory}
        sessionId={sessionId}
        isWsServiceConnected={isWsServiceConnected}
        // No title needed for this internal editor, or a generic one
        // Buttons like LoadToKB or QueryThis are not relevant here.
      />
      {/* The "Assert to KB" button is now part of PrologCodeViewer as "Save" */}
      {/* Display local status message for the assertion operation */}
      {assertionStatus.message && (
        <p style={{
          fontSize: '0.8em',
          marginTop: '5px',
          padding: '5px',
          borderRadius: '3px',
          backgroundColor: assertionStatus.type === 'error' ? 'rgba(248, 81, 73, 0.2)' :
                             assertionStatus.type === 'success' ? 'rgba(63, 185, 80, 0.2)' :
                             'rgba(88, 166, 255, 0.1)',
          color: assertionStatus.type === 'error' ? '#ff817a' :
                 assertionStatus.type === 'success' ? '#3fb950' :
                 '#58a6ff'
        }}>
          {assertionStatus.message}
        </p>
      )}
    </div>
  );
};

export default DirectAssertionEditor;
