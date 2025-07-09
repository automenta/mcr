// test-ws-client.js
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 8080; // Ensure this matches server config
const wsUrl = `ws://localhost:${PORT}/ws`;

const ws = new WebSocket(wsUrl);

let currentSessionId = null;

ws.on('open', function open() {
  console.log(`[TestClient] Connected to ${wsUrl}`);

  // 1. Create a session
  const createSessionMessage = {
    type: 'tool_invoke',
    correlationId: `client-${uuidv4()}`,
    payload: {
      tool_name: 'create_session',
      input: {} // No specific input needed for create_session
    }
  };
  console.log('[TestClient] Sending create_session message:', JSON.stringify(createSessionMessage, null, 2));
  ws.send(JSON.stringify(createSessionMessage));
});

ws.on('message', function incoming(data) {
  let message;
  try {
    message = JSON.parse(data);
  } catch (e) {
    console.error('[TestClient] Error parsing message from server:', data, e);
    return;
  }

  console.log(`[TestClient] Received message from server (type: ${message.type}):`, JSON.stringify(message, null, 2));

  if (message.type === 'tool_result') {
    if (message.payload && message.payload.success) {
      // Check which tool result this is for based on original message or content
      if (message.payload.sessionId && !currentSessionId) { // Assuming create_session result
        currentSessionId = message.payload.sessionId;
        console.log(`[TestClient] Session created: ${currentSessionId}`);

        // 2. Assert facts to the session
        const assertFactsMessage = {
          type: 'tool_invoke',
          correlationId: `client-${uuidv4()}`,
          payload: {
            tool_name: 'assert_facts_to_session',
            input: {
              sessionId: currentSessionId,
              naturalLanguageText: "Socrates is a man."
            }
          }
        };
        console.log('[TestClient] Sending assert_facts_to_session message:', JSON.stringify(assertFactsMessage, null, 2));
        ws.send(JSON.stringify(assertFactsMessage));

      } else if (message.payload.addedFacts) { // Assuming assert_facts_to_session result
        console.log('[TestClient] Facts asserted successfully. Waiting for kb_updated...');
        // kb_updated should arrive separately. Now, let's query.

        // 3. Query the session
        const querySessionMessage = {
          type: 'tool_invoke',
          correlationId: `client-${uuidv4()}`,
          payload: {
            tool_name: 'query_session',
            input: {
              sessionId: currentSessionId,
              naturalLanguageQuestion: "Is Socrates a man?"
            }
          }
        };
        console.log('[TestClient] Sending query_session message:', JSON.stringify(querySessionMessage, null, 2));
        ws.send(JSON.stringify(querySessionMessage));

      } else if (message.payload.answer) { // Assuming query_session result
         console.log(`[TestClient] Query answered. Answer: ${message.payload.answer}`);
         console.log('[TestClient] Test sequence complete. Closing connection.');
         ws.close();
      }
    } else if (message.payload && !message.payload.success) {
      console.error('[TestClient] Received error tool_result:', message.payload.message, message.payload.details || '');
      // Consider closing on critical errors
    }
  } else if (message.type === 'kb_updated') {
    console.log(`[TestClient] Knowledge base updated for session ${message.payload.sessionId}.`);
    console.log(`[TestClient] New facts:`, message.payload.newFacts);
    console.log(`[TestClient] Full KB:`, message.payload.fullKnowledgeBase);
    // After KB is updated from assertion, the assert_facts_to_session tool_result might trigger the query.
    // Or if assert_facts_to_session tool_result already came, this is just an update.
  } else if (message.type === 'error') {
    console.error('[TestClient] Received server error message:', message.payload.message);
  } else if (message.type === 'connection_ack') {
    console.log('[TestClient] Connection Acknowledged by server.');
  }
});

ws.on('close', function close() {
  console.log('[TestClient] Disconnected from server.');
});

ws.on('error', function error(err) {
  console.error('[TestClient] WebSocket error:', err.message);
});

console.log(`[TestClient] Attempting to connect to ${wsUrl}...`);
