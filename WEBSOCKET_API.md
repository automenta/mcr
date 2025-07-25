# MCR WebSocket API Reference

The Model Context Reasoner (MCR) service primarily uses WebSockets for its API. This document details the message formats and available tools.

## Connection

Connect to the WebSocket server at `ws://<host>:<port>/ws` (e.g., `ws://localhost:8080/ws` by default). All messages exchanged are JSON strings.

## General Message Principles

- **`messageId`**: Each client-initiated request (`tool_invoke`) should include a unique `messageId`. The server will echo this `messageId` in its `tool_result` response, allowing the client to correlate responses with requests.
- **`correlationId`**: The server assigns a `correlationId` to each WebSocket connection upon establishment. This ID is included in server responses (`tool_result`) and is used for logging and tracing requests on the server side. Clients can optionally send their own `X-Correlation-ID` in the `headers` field of a `tool_invoke` message if they wish to propagate a specific ID.
- **`type`**: All messages (client-to-server and server-to-client) have a `type` field indicating the nature of the message.

## Core Message Types

### 1. Client to Server: `tool_invoke`

Used by the client to request the server to execute a specific MCR tool.

**Structure:**
```json
{
  "type": "tool_invoke",
  "messageId": "string (unique client-generated ID, e.g., 'client-msg-123')",
  "payload": {
    "tool_name": "string (e.g., 'session.create', 'ontology.list')",
    "input": {
      // Object containing arguments specific to the tool.
      // Examples:
      // For 'session.create': {} or { "sessionId": "my-session" }
      // For 'session.assert': { "sessionId": "s1", "naturalLanguageText": "The sky is blue." }
    }
  }
  // Optional headers:
  // "headers": { "X-Correlation-ID": "client-correlation-id-if-any" }
}
```

- `payload.tool_name`: The name of the MCR tool to execute. See "Available Tools" below.
- `payload.input`: An object containing the parameters required by the specified tool.

### 2. Server to Client: `tool_result`

The server's response to a `tool_invoke` message.

**Structure:**
```json
{
  "type": "tool_result",
  "messageId": "string (echoed from the client's request)",
  "correlationId": "string (server's correlation ID for the WS connection)",
  "payload": {
    "success": true_or_false,
    // If success is true, other fields depend on the tool:
    "data": { ... }, // Primary data returned by the tool (e.g., session object, list of ontologies)
    "message": "string (Optional descriptive message, e.g., 'Session created successfully.')",
    "addedFacts": ["fact1.", "fact2."], // Specifically for assertion tools
    "fullKnowledgeBase": "prolog_string", // Specifically for assertion tools, current state of KB
    // If success is false:
    "error": "string (An error code, e.g., 'SESSION_NOT_FOUND', 'INVALID_INPUT')",
    "details": "string (Optional further details about the error)"
    // Other tool-specific fields like 'strategyId', 'cost', 'debugInfo' may also be present.
  }
}
```

- `payload.success`: Boolean indicating if the tool execution was successful.
- `payload.data`: Typically contains the main result of a successful operation.
- `payload.message`: A human-readable message.
- `payload.error` / `payload.details`: Provide information about errors if `success` is `false`.

### 3. Server to Client: `connection_ack`

Sent by the server immediately after a WebSocket connection is successfully established.

**Structure:**
```json
{
  "type": "connection_ack",
  "correlationId": "string (server's correlation ID for this WebSocket connection)",
  "message": "string (e.g., 'WebSocket connection established with MCR server.')"
}
```

### 4. Error Message (Generic)
If a message from the client is malformed (e.g., invalid JSON, missing critical fields like `messageId` or `type`), the server may respond with a generic error message.

**Structure:**
```json
{
  "type": "error",
  "messageId": "string (echoed if available, else null)",
  "correlationId": "string (server's WS connection ID, if connection established enough)",
  "payload": {
    "success": false,
    "error": "string (e.g., 'INVALID_JSON', 'MISSING_MESSAGE_ID')",
    "message": "string (Description of the error)"
  }
}
```

## Available Tools (`tool_name`)

The following tools can be invoked using the `tool_invoke` message type. The `input` object within `payload.input` should contain the specified parameters for each tool. All tool handlers are defined in `src/tools.js` and primarily interact with `src/mcrService.js` or `src/ontologyService.js`.

---

### General Tools

-   **`llm.passthrough`**
    -   Description: Sends a natural language string directly to the underlying Large Language Model for a direct, unmodified response. This is useful for tasks that don't require logical reasoning.
    -   Input: `{ "naturalLanguageText": "Any text to send to the LLM" }`
    -   Success Payload: `{ "success": true, "response": "The text response from the LLM" }`

-   **`mcr.handle`**
    -   Description: A smart handler for REPL-like interfaces. It automatically determines whether to treat the input as an assertion or a query based on a simple heuristic (e.g., ending with a "?").
    -   Input: `{ "sessionId": "id", "naturalLanguageText": "Text to be handled" }`
    -   Success Payload: The payload will be identical to the result of either `session.assert` or `session.query`, depending on the action taken.

### Session Management

-   **`session.create`**
    -   Description: Creates a new reasoning session.
    -   Input: `{ "sessionId": "optional-desired-id" }` (If `sessionId` is omitted, the server generates one.)
    -   Success Payload: `{ "success": true, "data": { "id": "session-id", "facts": "", "lexiconSummary": "" } }`

-   **`session.get`**
    -   Description: Retrieves details for an existing session, including its current Knowledge Base.
    -   Input: `{ "sessionId": "existing-session-id" }`
    -   Success Payload: `{ "success": true, "data": { "id": "session-id", "facts": "prolog_kb_string", "lexiconSummary": "summary_string" } }`

-   **`session.delete`**
    -   Description: Deletes a session.
    -   Input: `{ "sessionId": "existing-session-id" }`
    -   Success Payload: `{ "success": true, "message": "Session deleted." }`

-   **`session.assert`**
    -   Description: Asserts a natural language statement to a session. The statement is translated into Prolog facts/rules using the session's active strategy and added to its KB. The complete, updated knowledge base is returned upon success.
    -   Input: `{ "sessionId": "id", "naturalLanguageText": "NL statement" }`
    -   Success Payload: `{ "success": true, "message": "Facts asserted.", "addedFacts": ["prolog_fact1."], "fullKnowledgeBase": "complete_prolog_kb_string", "strategyId": "used_strategy_id", "cost": { ... } }`

-   **`session.assert_rules`**
    -   Description: Asserts raw Prolog rules directly into a session's KB. The complete, updated knowledge base is returned upon success.
    -   Input: `{ "sessionId": "id", "rules": ["rule1.", "rule2."] or "rule1. rule2.", "validate": true_or_false (optional, default true) }`
    -   Success Payload: `{ "success": true, "message": "Rules asserted.", "addedFacts": ["rule1."], "fullKnowledgeBase": "complete_prolog_kb_string" }`

-   **`session.set_kb`**
    -   Description: Replaces the entire Knowledge Base for a session with the provided content. The complete, updated knowledge base is returned upon success.
    -   Input: `{ "sessionId": "id", "kbContent": "full_prolog_kb_string" }`
    -   Success Payload: `{ "success": true, "message": "Knowledge base updated successfully.", "fullKnowledgeBase": "complete_prolog_kb_string" }`

-   **`session.query`**
    -   Description: Queries a session with a natural language question.
    -   Input: `{ "sessionId": "id", "naturalLanguageQuestion": "NL question", "queryOptions": { "dynamicOntology": "optional_prolog_rules_string", "style": "conversational_or_formal", "trace": true_or_false, "debug": true_or_false } }` (all fields in `queryOptions` are optional)
    -   Success Payload: `{ "success": true, "answer": "NL_answer_string", "explanation": "optional_trace_explanation_string", "debugInfo": { ... }, "strategyId": "used_strategy_id", "cost": { ... } }`

-   **`session.explainQuery`**
    -   Description: Explains how a natural language question might be interpreted or resolved in the context of a session.
    -   Input: `{ "sessionId": "id", "naturalLanguageQuestion": "NL question" }`
    -   Success Payload: `{ "success": true, "explanation": "NL_explanation_string", "debugInfo": { ... }, "strategyId": "used_strategy_id", "cost": { ... } }`

---

### Symbolic Exchange Tools

-   **`symbolic.export`**
    -   Description: Exports solutions to a Prolog goal from a session's knowledge base.
    -   Input: `{ "sessionId": "id", "goal": "your_goal(X)." }`
    -   Success Payload: `{ "success": true, "data": [...] }` (The data format depends on the solutions found)

-   **`symbolic.import`**
    -   Description: Imports raw Prolog clauses directly into a session's knowledge base.
    -   Input: `{ "sessionId": "id", "clauses": ["clause1.", "clause2."] }`
    -   Success Payload: `{ "success": true }`

### Ontology Management (Global Ontologies)

-   **`ontology.create`**
    -   Description: Creates a new global ontology.
    -   Input: `{ "name": "ontology-name", "rules": "prolog_rules_string" }`
    -   Success Payload: `{ "success": true, "data": { "id": "internal_id", "name": "ontology-name", "rules": "prolog_rules_string" } }`

-   **`ontology.list`**
    -   Description: Lists all available global ontologies.
    -   Input: `{ "includeRules": true_or_false (optional, default false) }`
    -   Success Payload: `{ "success": true, "data": [{ "id": "...", "name": "...", "rules": "optional..." }, ...] }`

-   **`ontology.get`**
    -   Description: Retrieves a specific global ontology by its name.
    -   Input: `{ "name": "ontology-name" }`
    -   Success Payload: `{ "success": true, "data": { "id": "...", "name": "...", "rules": "..." } }`

-   **`ontology.update`**
    -   Description: Updates the rules of an existing global ontology.
    -   Input: `{ "name": "ontology-name", "rules": "new_prolog_rules_string" }`
    -   Success Payload: `{ "success": true, "data": { "id": "...", "name": "...", "rules": "..." } }`

-   **`ontology.delete`**
    -   Description: Deletes a global ontology.
    -   Input: `{ "name": "ontology-name" }`
    -   Success Payload: `{ "success": true, "message": "Ontology deleted." }`

---

### Direct Translation Tools

-   **`translate.nlToRules`**
    -   Description: Translates natural language text directly to Prolog rules using a specified or default assertion strategy, without affecting any session.
    -   Input: `{ "naturalLanguageText": "NL statement", "strategyId": "optional_strategy_id_string" }`
    -   Success Payload: `{ "success": true, "rules": ["prolog_rule1."], "strategyId": "used_strategy_id", "cost": { ... } }`

-   **`translate.rulesToNl`**
    -   Description: Translates Prolog rules directly into a natural language explanation.
    -   Input: `{ "rules": "prolog_rules_string", "style": "optional_style_string (e.g., 'conversational')" }`
    -   Success Payload: `{ "success": true, "explanation": "NL_explanation_string", "cost": { ... } }`

---

### Strategy Management

-   **`strategy.list`**
    -   Description: Lists all available translation strategies loaded by the server.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": [{ "id": "strat1", "name": "Strategy One", "description": "..." }, ...] }`

-   **`strategy.setActive`**
    -   Description: Sets the server's active base translation strategy.
    -   Input: `{ "strategyId": "strategy-id-string" }`
    -   Success Payload: `{ "success": true, "message": "Strategy set.", "data": { "activeStrategyId": "strategy-id" } }`

-   **`strategy.getActive`**
    -   Description: Gets the ID of the currently active base translation strategy.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": { "activeStrategyId": "strategy-id" } }`

---

### Utility & Debugging Tools

-   **`utility.getPrompts`**
    -   Description: Retrieves all available prompt templates known to the system.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": { "PROMPT_NAME_1": { "system": "...", "user": "..." }, ... } }`

-   **`utility.debugFormatPrompt`**
    -   Description: Formats a specified prompt template with given input variables for debugging.
    -   Input: `{ "templateName": "PROMPT_NAME", "inputVariables": { "var1": "val1", ... } }`
    -   Success Payload: `{ "success": true, "templateName": "...", "rawTemplate": { ... }, "formattedUserPrompt": "...", "inputVariables": { ... } }`

---
### System Analysis Tools

-   **`analysis.get_strategy_leaderboard`**
    -   Description: Retrieves aggregated performance data for all evaluated strategies from the performance database.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": [{ "strategyId": "...", "strategyName": "...", "evaluations": 10, "successRate": 0.9, "avgLatencyMs": 1500, "avgCost": 0.00123 }, ...] }`

-   **`analysis.get_strategy_details`**
    -   Description: Retrieves detailed performance data, including individual runs, for a specific strategy.
    -   Input: `{ "strategyId": "sir-r1-query" }`
    -   Success Payload: `{ "success": true, "data": { "strategyId": "...", "definition": {...}, "hash": "...", "summary": {...}, "runs": [...] } }`

-   **`analysis.list_eval_curricula`**
    -   Description: Lists all available evaluation curricula (files containing test cases).
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": [{ "id": "path/to/file.js", "name": "file.js", "path": "path/to/file.js", "caseCount": 5 }, ...] }`

-   **`analysis.get_curriculum_details`**
    -   Description: Retrieves the content (the actual test cases) of a specific curriculum file.
    -   Input: `{ "curriculumId": "path/to/file.js" }`
    -   Success Payload: `{ "success": true, "data": { "id": "...", "name": "...", "cases": [...] } }`

---

### Evolution Tools

-   **`evolution.start_optimizer`**
    -   Description: Starts the strategy evolution optimizer script as a background process on the server.
    -   Input: `{ "options": { "iterations": 3, "runBootstrap": true } }` (All options are optional)
    -   Success Payload: `{ "success": true, "message": "Optimizer started with PID 12345.", "data": { "pid": 12345 } }`

-   **`evolution.get_status`**
    -   Description: Gets the current status (running or idle) of the optimizer process.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": { "status": "running", "pid": 12345 } }`

-   **`evolution.stop_optimizer`**
    -   Description: Stops the running optimizer process.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "message": "Optimizer termination signal sent." }`

-   **`evolution.get_optimizer_log`**
    -   Description: Retrieves recent logs captured from the optimizer process.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": { "logs": [{ "timestamp": "...", "type": "stdout", "message": "..." }, ...] } }`

---

### Demo Tools

-   **`demo.list`**
    -   Description: Lists all available predefined demos.
    -   Input: `{}` (empty object)
    -   Success Payload: `{ "success": true, "data": [{ "id": "familyOntologyDemo", "name": "...", "description": "..." }, ...] }`

-   **`demo.run`**
    -   Description: Runs a specific demo in a given session, returning captured logs from the demo run.
    -   Input: `{ "demoId": "familyOntologyDemo", "sessionId": "id" }`
    -   Success Payload: `{ "success": true, "data": { "demoId": "...", "messages": [...] } }`

---

## MCP (Model Context Protocol) Messages

MCR also handles MCP messages over the same WebSocket connection. These messages typically use an `action` field at the top level (e.g., `mcp.request_tools`, `mcp.invoke_tool`) and are processed by `src/mcpHandler.js`. Refer to MCP specifications for their exact structure.
The MCR server will respond to MCP messages as defined by the MCP specification, often involving `mcp.tool_response` messages.
