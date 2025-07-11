import React, { useState, useEffect, useRef } from 'react';

// CodeMirror Imports
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { prolog } from 'codemirror-lang-prolog';

// --- Helper Component for Prolog Code in Chat ---
// Displays Prolog code with syntax highlighting. Can be read-only or editable.
// Includes optional buttons for copy, load to KB, and query.
const PrologCodeViewer = ({
  code,
  title,
  addMessageToHistory,
  isEditable = false,
  onSave, // Callback for when editable content is saved (e.g., Ctrl+S or a save button)
  showLoadToKbButton = false,
  onLoadToKb, // Callback to load content to KB
  showQueryThisButton = false,
  onQueryThis, // Callback to execute content as query
  sessionId, // Needed for onLoadToKb and onQueryThis
  isWsServiceConnected, // Needed for button enablement
  initialContent, // For editable instances, to set initial doc
}) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null); // To store the EditorView instance
  const readOnlyCompartmentRef = useRef(new Compartment()); // For toggling readOnly
  const [currentCode, setCurrentCode] = useState(initialContent || code || '');
  const [copyStatus, setCopyStatus] = useState(''); // Feedback for copy action

  useEffect(() => {
    if (editorRef.current && !viewRef.current) { // Only create editor once
      const initialDoc = isEditable ? (initialContent || '') : (code || '');
      setCurrentCode(initialDoc); // Sync internal state with initial document
      const readOnlyCompartment = readOnlyCompartmentRef.current;

      const state = EditorState.create({
        doc: initialDoc,
        extensions: [
          basicSetup,
          EditorView.lineWrapping,
          oneDark,
          prolog(),
          readOnlyCompartment.of(EditorState.readOnly.of(!isEditable)),
          EditorView.theme({
            "&": {
              maxHeight: isEditable ? "300px" : "200px", // Allow more space for editable instances
              minHeight: isEditable ? "100px" : "auto",
              fontSize: "0.85em",
              border: "1px solid #30363d",
              borderRadius: "4px",
            },
            ".cm-scroller": { overflow: "auto" },
          }),
          EditorView.updateListener.of(update => {
            if (update.docChanged && isEditable) {
              setCurrentCode(update.state.doc.toString());
            }
          }),
          // Optional: Keymap for saving if editable (e.g., Ctrl+S)
          isEditable && onSave ? keymap.of([{
            key: "Mod-s",
            run: () => { onSave(viewRef.current.state.doc.toString()); return true; }
          }]) : []
        ],
      });
      const view = new EditorView({ state, parent: editorRef.current });
      viewRef.current = view;
    } else if (viewRef.current && !isEditable && code !== viewRef.current.state.doc.toString()) {
      // If read-only and code prop changes, update the editor
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: code || '' }
      });
      setCurrentCode(code || ''); // Also update internal state if needed
    }

    // Cleanup
    return () => {
      // Basic cleanup: if the view was created, destroy it on unmount.
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  // Dependencies for re-creating the editor: if isEditable changes, or onSave callback changes,
  // or if the initial content meant for the editor changes.
  // `code` is for read-only display, `initialContent` for editable initial state.
  }, [isEditable, initialContent, code, onSave]);

  // Update editor's readOnly state if isEditable prop changes dynamically
  useEffect(() => {
    if (viewRef.current && readOnlyCompartmentRef.current) {
      const readOnlyCompartment = readOnlyCompartmentRef.current;
      viewRef.current.dispatch({
        effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(!isEditable))
      });
    }
  // Only re-run if isEditable changes and the view/compartment are initialized.
  }, [isEditable, viewRef, readOnlyCompartmentRef]);


  const handleCopyCode = () => {
    const codeToCopy = viewRef.current ? viewRef.current.state.doc.toString() : currentCode;
    if (navigator.clipboard && codeToCopy) {
      navigator.clipboard.writeText(codeToCopy)
        .then(() => {
          setCopyStatus('Copied!');
          setTimeout(() => setCopyStatus(''), 1500);
          if (addMessageToHistory) {
            // addMessageToHistory({ type: 'system', text: `📋 '${title || 'Prolog code'}' copied to clipboard.` });
          }
        })
        .catch(err => {
          setCopyStatus('Failed!');
          setTimeout(() => setCopyStatus(''), 1500);
          console.error(`Failed to copy ${title || 'Prolog code'}:`, err);
          if (addMessageToHistory) {
            // addMessageToHistory({ type: 'system', text: `❌ Error copying '${title || 'Prolog code'}'.` });
          }
        });
    }
  };

  const handleLoadToKb = () => {
    if (onLoadToKb) {
      const codeToLoad = viewRef.current ? viewRef.current.state.doc.toString() : currentCode;
      onLoadToKb(codeToLoad);
    }
  };

  const handleQueryThis = () => {
    if (onQueryThis) {
      const queryToRun = viewRef.current ? viewRef.current.state.doc.toString() : currentCode;
      onQueryThis(queryToRun);
    }
  };

  return (
    <div style={{ marginTop: '5px', marginBottom: '5px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px', flexWrap: 'wrap' }}>
        {title && <p style={{ fontSize: '0.9em', color: '#8b949e', marginRight: '10px' }}>{title}:</p>}
        <div className="prolog-viewer-actions">
          {showLoadToKbButton && onLoadToKb && (
            <button
              onClick={handleLoadToKb}
              disabled={!sessionId || !isWsServiceConnected}
              title="⚡ Load this code into the Knowledge Base"
              className="action-button"
            >
              ➕ Load to KB
            </button>
          )}
          {showQueryThisButton && onQueryThis && (
            <button
              onClick={handleQueryThis}
              disabled={!sessionId || !isWsServiceConnected}
              title="❓ Execute this code as a query"
              className="action-button"
            >
              ❓ Query This
            </button>
          )}
          <button
            onClick={handleCopyCode}
            title={`📋 Copy ${title || 'Prolog code'}`}
            className="action-button"
          >
            {copyStatus || '📋 Copy'}
          </button>
          {isEditable && onSave && (
             <button
              onClick={() => onSave(viewRef.current.state.doc.toString())}
              disabled={!sessionId || !isWsServiceConnected} // Assuming save might interact with session
              title="💾 Save changes (Ctrl+S)"
              className="action-button"
            >
              💾 Save
            </button>
          )}
        </div>
      </div>
      <div ref={editorRef}></div>
    </div>
  );
};

export default PrologCodeViewer;
