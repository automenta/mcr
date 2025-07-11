import React, { useState, useEffect, useRef } from 'react';
import apiService from '../../apiService'; // Adjusted path
import PrologCodeViewer from '../PrologCodeViewer'; // Adjusted path

const MainInteraction = ({ sessionId, isMcrSessionActive, isWsServiceConnected, addMessageToHistory, chatHistory }) => {
  const [inputText, setInputText] = useState(''); // State for the text in the input textarea
  const [interactionType, setInteractionType] = useState('query'); // State for 'query' or 'assert' selection
  const chatHistoryRef = useRef(null); // Ref for the chat history container to enable auto-scrolling

  useEffect(() => {
    // Auto-scroll to the bottom of the chat history pane when new messages are added.
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatHistory]); // Dependency: runs when chatHistory array changes.

  // Handles submission of user input (natural language query or assertion).
  const handleSubmit = async () => {
    if (!inputText.trim() || !isMcrSessionActive) return; // Basic validation.
    const toolName = interactionType === 'assert' ? 'session.assert' : 'session.query'; // Determine backend tool based on selected interaction type.
    const inputPayload = interactionType === 'assert'
      ? { sessionId, naturalLanguageText: inputText }
      : { sessionId, naturalLanguageQuestion: inputText, queryOptions: { trace: true, debug: true } };
    addMessageToHistory({ type: 'user', text: `(${interactionType}) ${inputText}` });
    setInputText('');
    try {
      const response = await apiService.invokeTool(toolName, inputPayload);
      addMessageToHistory({ type: 'mcr', response });
    } catch (error) {
      addMessageToHistory({ type: 'mcr', response: { success: false, message: error.message || 'Request failed', error } });
    }
  };

  // Handles actions from PrologCodeViewer buttons (Load to KB, Query This)
  const handlePrologAction = async (prologCode, actionType) => {
    if (!prologCode.trim() || !isMcrSessionActive || !sessionId || !isWsServiceConnected) {
      addMessageToHistory({ type: 'system', text: '⚠️ Cannot perform Prolog action: Session/connection issue or empty code.' });
      return;
    }

    let toolName;
    let inputPayload;
    let userMessagePrefix;

    if (actionType === 'assert_rules') {
      toolName = 'session.assert_rules';
      inputPayload = { sessionId, rules: prologCode };
      userMessagePrefix = '✍️ Asserting from viewer';
    } else if (actionType === 'query') {
      toolName = 'session.query';
      inputPayload = { sessionId, naturalLanguageQuestion: prologCode, queryOptions: { trace: true, debug: true, source: 'prolog_viewer' } };
      userMessagePrefix = '❓ Querying from viewer';
    } else {
      addMessageToHistory({ type: 'system', text: `⚠️ Unknown Prolog action: ${actionType}` });
      return;
    }

    addMessageToHistory({ type: 'user', text: `${userMessagePrefix}: \n${prologCode}` });

    try {
      const response = await apiService.invokeTool(toolName, inputPayload);
      addMessageToHistory({ type: 'mcr', response });
      // KB updates should be handled by 'kb_updated' broadcast or explicit refresh in RightSidebar
    } catch (error) {
      addMessageToHistory({ type: 'mcr', response: { success: false, message: error.message || 'Prolog action failed', error } });
    }
  };


  return (
    <div className="main-interaction-wrapper"> {/* Renamed from main-content for clarity, or use main-content and ensure it's flex-column */}
      <h3>💬 Chat REPL</h3>
      <div className="chat-history-pane" ref={chatHistoryRef}>
        {chatHistory.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.type} ${msg.isDemo ? 'demo-message' : ''} ${msg.demoLevel ? `demo-log-${msg.demoLevel}` : ''}`}>
            {msg.type === 'user' && <strong>👤 User: {msg.text}</strong>}
            {msg.type === 'system' && <em>⚙️ System: {msg.text}</em>}

            {/* Render regular MCR (non-demo) responses */}
            {msg.type === 'mcr' && !msg.isDemo && (
              // Check if the response indicates success or failure
              msg.response?.success !== false ? (
                // Block for successful MCR responses
                <div>
                  <p><strong>🤖 MCR:</strong> {msg.response?.answer || 'Received a response.'}</p>
                  {/* Display added facts if present */}
                  {msg.response?.addedFacts && Array.isArray(msg.response.addedFacts) && msg.response.addedFacts.length > 0 && (
                    <PrologCodeViewer
                      code={msg.response.addedFacts.join('\n')}
                      title="✍️ Added Facts"
                      addMessageToHistory={addMessageToHistory}
                      showLoadToKbButton={true} // Allow re-asserting these facts
                      onLoadToKb={(facts) => handlePrologAction(facts, 'assert_rules')}
                      sessionId={sessionId}
                      isWsServiceConnected={isWsServiceConnected} // Passed down from App through MainInteraction
                    />
                  )}
                  {/* Display Prolog trace from debugInfo if present */}
                  {msg.response?.debugInfo?.prologTrace && (
                    <PrologCodeViewer
                      code={msg.response.debugInfo.prologTrace}
                      title="🕵️ Prolog Trace"
                      addMessageToHistory={addMessageToHistory}
                      showQueryThisButton={true} // Allow running parts of the trace as a query
                      onQueryThis={(query) => handlePrologAction(query, 'query')}
                      sessionId={sessionId}
                      isWsServiceConnected={isWsServiceConnected}
                    />
                  )}
                  {/* Display explanation, attempting to render as Prolog if it looks like it */}
                  {msg.response?.explanation && (
                    typeof msg.response.explanation === 'string' &&
                    (msg.response.explanation.includes(":-") || msg.response.explanation.trim().endsWith(".")) &&
                    msg.response.explanation.length > 10 // Heuristic for Prolog-like string
                  ) ? (
                    <PrologCodeViewer
                      code={msg.response.explanation}
                      title="📜 Explanation (Prolog)"
                      addMessageToHistory={addMessageToHistory}
                      showLoadToKbButton={true} // If explanation is a rule, allow asserting
                      onLoadToKb={(rules) => handlePrologAction(rules, 'assert_rules')}
                      showQueryThisButton={true} // If explanation is a goal, allow querying
                      onQueryThis={(query) => handlePrologAction(query, 'query')}
                      sessionId={sessionId}
                      isWsServiceConnected={isWsServiceConnected}
                    />
                  ) : msg.response?.explanation ? (
                    <div>
                        <p style={{ fontSize: '0.9em', color: '#8b949e', marginBottom: '3px' }}>💬 Explanation:</p>
                        <p>{msg.response.explanation}</p>
                    </div>
                  ) : null}
                  {/* Collapsible section for all other raw details in the response */}
                  {msg.response && (
                    <details>
                      <summary>🔬 Raw Details</summary>
                      <pre>{JSON.stringify(
                        Object.fromEntries(
                          Object.entries(msg.response).filter(([key]) => !['answer', 'addedFacts', 'explanation', 'debugInfo', 'message', 'success'].includes(key) || (key === 'debugInfo' && !msg.response.debugInfo.prologTrace))
                        ), null, 2
                      )}</pre>
                    </details>
                  )}
                </div>
              ) : (
                // Block for MCR responses that indicate an error (success === false)
                <div>
                  <p><strong>⚠️ MCR Error:</strong> <span style={{color: '#ff817a'}}>{msg.response.message || msg.response.error || 'An unspecified error occurred.'}</span></p>
                  {/* Collapsible section for additional error details */}
                  {(msg.response.details || (msg.response.error && msg.response.message)) && (
                    <details style={{marginTop: '5px'}}>
                      <summary style={{color: '#ff817a', fontSize:'0.9em'}}>🔬 Error Details</summary>
                      <pre style={{borderColor: '#ff817a'}}>
                        {JSON.stringify(Object.fromEntries(
                          Object.entries(msg.response).filter(([key]) => !['success', 'message', 'error'].includes(key) || (key === 'error' && msg.response.message) )
                        ), null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              )
            )}

            {/* Render messages from demo runs (which are also of type 'mcr' but have isDemo: true) */}
            {msg.isDemo && msg.type === 'mcr' && (
              <div>
                <p><strong>🚀 Demo ({msg.demoPayload?.demoId || 'Run'}):</strong></p>
                {msg.demoPayload?.messages?.map((demoMsg, demoIdx) => (
                  <div key={demoIdx} className={`demo-log-item demo-log-${demoMsg.level || 'info'}`}>
                    <em>{demoMsg.level || 'log'}:</em> {demoMsg.message}
                    {demoMsg.details && <pre style={{ fontSize: '0.8em', marginLeft: '10px' }}>{JSON.stringify(demoMsg.details, null, 2)}</pre>}
                  </div>
                ))}
                {msg.response && msg.response.success === false && ( // If the demo tool itself failed
                   <p style={{color: 'red'}}><strong>❌ Demo Tool Error:</strong> {msg.response.message}</p>
                )}
              </div>
            )}
             {msg.isDemo && msg.type === 'demo_log' && ( // Individual demo log line
              <div className={`demo-log-item demo-log-${msg.level || 'info'}`}>
                <em>🚀 Demo ({msg.level || 'log'}):</em> {msg.text}
                {msg.details && <pre style={{ fontSize: '0.8em', marginLeft: '10px' }}>{JSON.stringify(msg.details, null, 2)}</pre>}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="chat-input-area">
        <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={isMcrSessionActive ? "Type assertion or query... (Shift+Enter for new line)" : "🔌 Connect session to start"} rows={3} disabled={!isMcrSessionActive}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div>
          <select value={interactionType} onChange={(e) => setInteractionType(e.target.value)} disabled={!isMcrSessionActive}>
            <option value="query">❓ Query</option> <option value="assert">✍️ Assert</option>
          </select>
          <button onClick={handleSubmit} disabled={!isMcrSessionActive || !inputText.trim()} title="Send Message (Enter)">▶️ Send</button>
        </div>
      </div>
    </div>
  );
};

export default MainInteraction;
