import React, { useState, useEffect, useRef } from 'react';
import apiService from '../../apiService'; // Adjusted path

// CodeMirror Imports (assuming they are needed here, verify based on original App.jsx)
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { prolog } from 'codemirror-lang-prolog';


const RightSidebar = ({ knowledgeBase, isMcrSessionActive, sessionId, fetchCurrentKb, addMessageToHistory, setCurrentKb }) => {
  const editorRef = useRef(null); // Ref for the CodeMirror editor's parent div
  const viewRef = useRef(null); // Ref to store the CodeMirror EditorView instance
  const [copyStatus, setCopyStatus] = useState(''); // Status message for copy action (e.g., "Copied!")
  const [isDirty, setIsDirty] = useState(false); // Tracks if the editor content has changed from the last saved state or prop update
  const [editableKbContent, setEditableKbContent] = useState(knowledgeBase || ''); // Local state for the editor's content, initially from prop
  const [kbQuery, setKbQuery] = useState(''); // State for the KB query input
  const [kbQueryResult, setKbQueryResult] = useState(null); // State for displaying query results { success: bool, message: string, results: [] }
  const [isQueryingKb, setIsQueryingKb] = useState(false); // Loading state for KB query

  useEffect(() => {
    // This effect synchronizes the editor's content when the `knowledgeBase` prop changes.
    setEditableKbContent(knowledgeBase || ''); // Update local state
    if (viewRef.current) { // If editor is initialized
      const currentEditorDoc = viewRef.current.state.doc.toString();
      if (currentEditorDoc !== (knowledgeBase || '')) { // Only update if different
        viewRef.current.dispatch({
          changes: { from: 0, to: currentEditorDoc.length, insert: knowledgeBase || '' }
        });
      }
    }
    setIsDirty(false); // Content is now aligned with prop, so it's not "dirty" relative to the source.
  }, [knowledgeBase]); // Dependency: runs when `knowledgeBase` prop from App state changes.


  useEffect(() => {
    // Initializes the CodeMirror editor instance.
    if (editorRef.current && !viewRef.current && isMcrSessionActive) {
      const state = EditorState.create({
        doc: editableKbContent, // Initialize with current KB content.
        extensions: [
          basicSetup, // Standard CodeMirror features.
          oneDark,    // Dark theme.
          prolog(),   // Prolog language support.
          EditorView.lineWrapping, // Wrap long lines.
          EditorView.updateListener.of(update => {
            if (update.docChanged) {
              setEditableKbContent(update.state.doc.toString()); // Keep React state in sync.
              setIsDirty(true); // Mark as dirty because the user has made changes.
            }
          }),
          EditorView.theme({ // Custom styling.
            "&": {
              height: "calc(100% - 75px)", // Adjust height for buttons below.
              fontSize: "0.9em",
            },
            ".cm-scroller": { overflow: "auto" },
          })
        ],
      });
      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view; // Store the CodeMirror view instance.
    }
  }, [isMcrSessionActive, editableKbContent]);

  const handleCopyKb = () => {
    const contentToCopy = viewRef.current ? viewRef.current.state.doc.toString() : editableKbContent;
    if (navigator.clipboard && contentToCopy) {
      navigator.clipboard.writeText(contentToCopy)
        .then(() => {
          setCopyStatus('Copied!');
          setTimeout(() => setCopyStatus(''), 2000);
          addMessageToHistory({ type: 'system', text: '📝 KB content copied to clipboard.' });
        })
        .catch(err => {
          setCopyStatus('Failed to copy.');
          console.error('Failed to copy KB:', err);
          addMessageToHistory({ type: 'system', text: `❌ Error copying KB: ${err.message}` });
        });
    }
  };

  const handleRefreshKb = () => {
    if (sessionId && fetchCurrentKb) {
      if (isDirty) {
        if (!confirm("⚠️ You have unsaved changes in the KB editor. Refreshing will discard them. Continue?")) {
          return;
        }
      }
      fetchCurrentKb(sessionId);
      addMessageToHistory({ type: 'system', text: '🔄 Refreshing KB from server...' });
    }
  };

  const handleSaveChanges = async () => {
    if (!sessionId || !isMcrSessionActive || !viewRef.current) {
      addMessageToHistory({ type: 'system', text: '⚠️ Cannot save KB: No active session or editor not ready.' });
      return;
    }
    const newKbContent = viewRef.current.state.doc.toString();
    addMessageToHistory({ type: 'system', text: `💾 Saving KB to server...` });
    try {
      const response = await apiService.invokeTool('session.set_kb', { sessionId, kbContent: newKbContent });
      if (response.success) {
        addMessageToHistory({ type: 'system', text: '✅ KB saved successfully.' });
        setCurrentKb(newKbContent);
        setIsDirty(false);
      } else {
        addMessageToHistory({ type: 'system', text: `❌ Error saving KB: ${response.message || 'Unknown error'}` });
      }
    } catch (error) {
      addMessageToHistory({ type: 'system', text: `❌ Exception saving KB: ${error.message}` });
      console.error("Exception saving KB:", error);
    }
  };

  const handleRunKbQuery = async () => {
    if (!kbQuery.trim()) {
      setKbQueryResult({ success: false, message: 'Query is empty.', results: [] });
      return;
    }
    if (!viewRef.current) {
      setKbQueryResult({ success: false, message: 'KB editor not ready.', results: [] });
      return;
    }

    const currentKbContent = viewRef.current.state.doc.toString();
    setIsQueryingKb(true);
    setKbQueryResult(null);

    addMessageToHistory({ type: 'system', text: `🔍 Querying against current KB editor content: ${kbQuery}`});

    try {
      const response = await apiService.invokeTool('session.query_with_temporary_kb', {
        sessionId: sessionId,
        kbContent: currentKbContent,
        query: kbQuery
      });

      if (response.success) {
        setKbQueryResult({
            success: true,
            message: response.message || `Query successful. Solutions: ${response.data?.solutions?.length || 0}`,
            solutions: response.data?.solutions || [],
            rawResponse: response.data,
        });
      } else {
        setKbQueryResult({ success: false, message: `Query failed: ${response.message || response.error || 'Unknown error'}`, solutions: [] });
      }
    } catch (error) {
      setKbQueryResult({ success: false, message: `Exception during query: ${error.message}`, solutions: [] });
      addMessageToHistory({ type: 'system', text: `❌ Exception querying KB: ${error.message}`});
    } finally {
      setIsQueryingKb(false);
    }
  };

  return (
    <div className="sidebar right-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem'}}>
        <h3>🧠 Knowledge Base {isDirty ? "*" : ""}</h3>
      </div>
      {isMcrSessionActive ? (
        <>
          <div ref={editorRef} style={{ flexGrow: 1, overflow: 'hidden', border: '1px solid #30363d', borderRadius: '4px', marginBottom: '10px' }}></div>
          <div className="kb-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
            <div>
              <button onClick={handleSaveChanges} disabled={!isDirty || !isMcrSessionActive} title="Save changes to session KB">💾 Save KB</button>
              <button onClick={handleRefreshKb} disabled={!isMcrSessionActive} title="Refresh KB from server (discard local changes if any)" style={{marginLeft: '5px'}}>🔄 Refresh</button>
            </div>
            <div>
              <button onClick={handleCopyKb} disabled={!isMcrSessionActive || !editableKbContent} title="Copy KB content" style={{marginLeft: '5px'}}>📋 Copy</button>
              {copyStatus && <span style={{marginLeft: '10px', fontSize: '0.8em', fontStyle: 'italic'}}>{copyStatus}</span>}
            </div>
          </div>

          {/* KB Query Area */}
          <div className="kb-query-area">
            <h4>🧪 Test Query Against Editor KB</h4>
            <div style={{display: 'flex', marginBottom: '5px'}}>
              <input
                type="text"
                value={kbQuery}
                onChange={(e) => setKbQuery(e.target.value)}
                placeholder="e.g., father(X, Y)."
                style={{flexGrow: 1, marginRight: '5px', fontSize:'0.85em'}}
                disabled={isQueryingKb}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRunKbQuery(); }}
              />
              <button onClick={handleRunKbQuery} disabled={isQueryingKb || !kbQuery.trim()}>
                {isQueryingKb ? '⏳ Running...' : '❓ Run Query'}
              </button>
            </div>
            {kbQueryResult && (
              <div className="kb-query-results"
                   style={{
                     marginTop: '8px', padding: '8px', border: `1px solid ${kbQueryResult.success ? '#3fb950' : '#ff817a'}`,
                     borderRadius: '4px', background: kbQueryResult.success ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                     fontSize: '0.85em', maxHeight: '150px', overflowY: 'auto'
                   }}>
                <p style={{color: kbQueryResult.success ? '#3fb950' : '#ff817a', fontWeight:'bold'}}>{kbQueryResult.message}</p>
                {kbQueryResult.solutions && kbQueryResult.solutions.length > 0 && (
                  <pre>{JSON.stringify(kbQueryResult.solutions, null, 2)}</pre>
                )}
                {!kbQueryResult.success && kbQueryResult.rawResponse && (
                     <details><summary>Raw Error Details</summary><pre>{JSON.stringify(kbQueryResult.rawResponse, null, 2)}</pre></details>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-muted" style={{textAlign: 'center', marginTop: '20px'}}>🔌 Connect to a session to view Knowledge Base.</p>
      )}
    </div>
  );
};

export default RightSidebar;
