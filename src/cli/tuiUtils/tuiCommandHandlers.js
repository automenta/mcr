// src/cli/tuiUtils/tuiCommandHandlers.js



async function handleStatusCommand(tuiContext /*, args */) {
  const { addMessage, tuiGetServerStatus, setServerStatus, setActiveLlmInfo } = tuiContext;

  try {
    const statusData = await tuiGetServerStatus(); // API call
    // Update McrApp's state via setters in tuiContext for the status bar
    setServerStatus(`OK (v${statusData?.version})`);
    if (statusData?.activeLlmProvider) {
      setActiveLlmInfo(`LLM: ${statusData.activeLlmProvider} (${statusData.activeLlmModel || 'default'})`);
    } else {
      setActiveLlmInfo('LLM: N/A');
    }
    // Also add messages to the main chat window
    addMessage('system', `Server Status: OK (v${statusData?.version})`);
    addMessage('output', `Name: ${statusData.name}`);
    addMessage('output', `Version: ${statusData.version}`);
    addMessage('output', `Description: ${statusData.description}`);
  } catch (error) {
    const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Unknown error';
    addMessage('error', `Server status check failed: ${errorMessage}`);
    // Update McrApp's state via setters
    setServerStatus('Unavailable');
    setActiveLlmInfo('LLM: N/A');
  }
}

// Helper function to get current session or error
function _getActiveSessionIdOrError(tuiContext, commandName) {
  const currentSessionId = tuiContext.getCurrentSessionId();
  if (!currentSessionId) {
    tuiContext.addMessage('error', `No active session for /${commandName}. Use /create-session or chat first.`);
    return null;
  }
  return currentSessionId;
}

async function handleHelpCommand(tuiContext /*, args */) {
  const { addMessage } = tuiContext;
  addMessage('system', 'Available commands:');
  addMessage('system', '  /help                               - Show this help message');
  addMessage('system', '  /status                             - Check MCR server status');
  addMessage('system', '  /create-session                     - Create a new session');
  addMessage('system', '  /get-session [id]                   - Get details for a session (current if no id)');
  addMessage('system', '  /delete-session [id]                - Delete a session (current if no id)');
  addMessage('system', '  /assert <text>                      - Assert facts to current session');
  addMessage('system', '  /query <question>                   - Query current session');
  addMessage('system', '  /explain <question>                 - Explain query for current session');
  addMessage('system', '  /list-ontologies                    - List all global ontologies');
  addMessage('system', '  /get-ontology <name>                - Get details of a specific ontology');
  addMessage('system', '  /add-ontology <name> <path>         - Add a new ontology from a rules file');
  addMessage('system', '  /update-ontology <name> <path>      - Update an ontology from a rules file');
  addMessage('system', '  /delete-ontology <name>             - Delete an ontology');
  addMessage('system', '  /nl2rules <text> [--facts "..."] [--ontology path/file.pl] - Translate NL to Prolog');
  addMessage('system', '  /rules2nl <path> [--style formal|conversational] - Translate Prolog file to NL');
  addMessage('system', '  /list-prompts                       - List all prompt templates');
  addMessage('system', '  /show-prompt <templateName>         - Show a specific prompt template');
  addMessage('system', '  /debug-prompt <templateName> <json> - Debug a prompt template with JSON variables');
  addMessage('system', '  /run-demo <simpleQA|family>         - Run a demo script');
  addMessage('system', '  /toggle-debug-chat                  - Toggle verbose output for chat messages');
  addMessage('system', '  /exit, /quit                        - Exit the application');
}


async function handleCreateSessionCommand(tuiContext/*, args*/) {
  const { addMessage, agentApiCreateSession, setCurrentSessionId } = tuiContext;
  const response = await agentApiCreateSession(); // Uses the alias from chatCommand's api import
  setCurrentSessionId(response.sessionId);
  addMessage('system', `New session created: ${response.sessionId}`);
  addMessage('output', response);
}

async function handleGetSessionCommand(tuiContext, args) {
  const { addMessage, agentApiGetSession, getCurrentSessionId } = tuiContext; // Assuming agentApiGetSession is in context
  const targetSessionId = args[0] || getCurrentSessionId();
  if (!targetSessionId) {
    addMessage('error', 'No session ID specified and no active session.');
    return;
  }
  const response = await agentApiGetSession(targetSessionId); // This needs to be added to tuiContext if not already
  addMessage('system', `Details for session ${targetSessionId}:`);
  addMessage('output', response);
}

async function handleDeleteSessionCommand(tuiContext, args) {
  const { addMessage, agentApiDeleteSession, getCurrentSessionId, setCurrentSessionId } = tuiContext;
  const targetSessionId = args[0] || getCurrentSessionId();
  if (!targetSessionId) {
    addMessage('error', 'No session ID specified and no active session.');
    return;
  }
  const response = await agentApiDeleteSession(targetSessionId);
  addMessage('system', response.message || `Session ${targetSessionId} deleted.`);
  if (targetSessionId === getCurrentSessionId()) {
    setCurrentSessionId(null);
    addMessage('system', 'Active session cleared.');
  }
}


module.exports = {
  handleHelpCommand,
  handleStatusCommand,
  handleCreateSessionCommand,
  handleGetSessionCommand,
  handleDeleteSessionCommand,
  handleAssertCommand,
  handleQueryCommand,
  handleExplainCommand,
  handleListOntologiesCommand,
  handleGetOntologyCommand,
  handleAddOntologyCommand,
  handleUpdateOntologyCommand,
  handleDeleteOntologyCommand,
  handleNl2RulesCommand,
  handleRules2NlCommand,
  handleListPromptsCommand,
  handleShowPromptCommand,
  handleDebugPromptCommand,
  handleToggleDebugChatCommand,
  // Other handlers will be added here
};

async function handleToggleDebugChatCommand(tuiContext/*, args*/) {
  const { addMessage, getChatDebugMode, setChatDebugMode } = tuiContext;
  const newDebugMode = !getChatDebugMode();
  setChatDebugMode(newDebugMode);
  addMessage(
    'system',
    `Chat debug mode ${newDebugMode ? 'enabled' : 'disabled'}. Query responses will now ${newDebugMode ? 'include more' : 'not include extra'} details.`
  );
}


async function handleNl2RulesCommand(tuiContext, args) {
  const { addMessage, nlToRules, readFileContentSafe, parseTuiCommandArgs } = tuiContext;
  const parsedArgs = parseTuiCommandArgs(args);
  const text = parsedArgs._.join(' ');
  if (!text) {
    addMessage('error', 'Usage: /nl2rules <text> [--facts "..."] [--ontology path/file.pl]');
    return;
  }
  let nlFacts = null;
  let nlOntologyContext = null;
  if (parsedArgs.options.facts) {
    nlFacts = parsedArgs.options.facts;
  }
  if (parsedArgs.options.ontology) {
    nlOntologyContext = readFileContentSafe(parsedArgs.options.ontology, addMessage, 'Ontology context file for /nl2rules');
    if (!nlOntologyContext) return;
  }
  const response = await nlToRules(text, nlFacts, nlOntologyContext);
  addMessage('system', 'Translated NL to Rules:');
  addMessage('output', response);
}

async function handleRules2NlCommand(tuiContext, args) {
  const { addMessage, rulesToNl, readFileContentSafe, parseTuiCommandArgs } = tuiContext;
  const parsedArgs = parseTuiCommandArgs(args);
  const filePath = parsedArgs._[0];
  if (!filePath) {
    addMessage('error', 'Usage: /rules2nl <filePath> [--style formal|conversational]');
    return;
  }
  const rulesContent = readFileContentSafe(filePath, addMessage, 'Rules file for /rules2nl');
  if (!rulesContent) return;
  const style = parsedArgs.options.style || 'formal';
  const response = await rulesToNl(rulesContent, style);
  addMessage('system', `Translated Rules from "${filePath}" to NL (style: ${style}):`);
  addMessage('output', response);
}

async function handleListPromptsCommand(tuiContext/*, args*/) {
  const { addMessage, listPrompts } = tuiContext;
  const response = await listPrompts();
  addMessage('system', 'Available prompt templates:');
  if (Object.keys(response).length === 0) {
    addMessage('output', 'No prompt templates found.');
  } else {
    Object.keys(response).forEach((name) => addMessage('output', `- ${name}`));
  }
}

async function handleShowPromptCommand(tuiContext, args) {
  const { addMessage, listPrompts } = tuiContext;
  const templateName = args[0];
  if (!templateName) {
    addMessage('error', 'Usage: /show-prompt <templateName>');
    return;
  }
  const allPrompts = await listPrompts();
  if (!allPrompts[templateName]) {
    addMessage('error', `Prompt template '${templateName}' not found.`);
    return;
  }
  addMessage('system', `Content of prompt template '${templateName}':`);
  addMessage('output', allPrompts[templateName]);
}

async function handleDebugPromptCommand(tuiContext, args) {
  const { addMessage, debugFormatPrompt } = tuiContext;
  const templateName = args[0];
  const inputVariablesJson = args.slice(1).join(' ');
  if (!templateName || !inputVariablesJson) {
    addMessage('error', 'Usage: /debug-prompt <templateName> <inputVariablesJsonString>');
    return;
  }
  let inputVars;
  try {
    inputVars = JSON.parse(inputVariablesJson);
  } catch (e) {
    addMessage('error', `Invalid JSON for input variables: ${e.message}`);
    return;
  }
  const response = await debugFormatPrompt(templateName, inputVars);
  addMessage('system', `Debugging prompt template '${response.templateName}':`);
  addMessage('output', `Raw Template: ${response.rawTemplate}`);
  addMessage('output', `Input Variables: ${JSON.stringify(response.inputVariables, null, 2)}`);
  addMessage('output', `Formatted Prompt: ${response.formattedPrompt}`);
}


async function handleListOntologiesCommand(tuiContext/*, args*/) {
  const { addMessage, listOntologies } = tuiContext;
  const response = await listOntologies();
  addMessage('system', 'Available Ontologies:');
  if (response.length === 0) {
    addMessage('output', 'No ontologies found.');
  } else {
    response.forEach((ont) =>
      addMessage('output', `- ${ont.name} (${ont.rules ? ont.rules.split('\n').length : 0} rules)`)
    );
  }
}

async function handleGetOntologyCommand(tuiContext, args) {
  const { addMessage, getOntology } = tuiContext;
  const ontologyName = args[0];
  if (!ontologyName) {
    addMessage('error', 'Usage: /get-ontology <name>');
    return;
  }
  const response = await getOntology(ontologyName);
  addMessage('system', `Details for ontology "${ontologyName}":`);
  addMessage('output', response);
}

async function handleAddOntologyCommand(tuiContext, args) {
  const { addMessage, agentApiAddOntology, readFileContentSafe } = tuiContext;
  const [ontologyName, filePath] = args;
  if (!ontologyName || !filePath) {
    addMessage('error', 'Usage: /add-ontology <name> <filePath>');
    return;
  }
  const rulesContent = readFileContentSafe(filePath, addMessage, 'Ontology rules file for /add-ontology');
  if (!rulesContent) return;
  const response = await agentApiAddOntology(ontologyName, rulesContent);
  addMessage('system', `Ontology "${ontologyName}" added:`);
  addMessage('output', response);
}

async function handleUpdateOntologyCommand(tuiContext, args) {
  const { addMessage, updateOntology, readFileContentSafe } = tuiContext;
  const [ontologyName, filePath] = args;
  if (!ontologyName || !filePath) {
    addMessage('error', 'Usage: /update-ontology <name> <filePath>');
    return;
  }
  const rulesContent = readFileContentSafe(filePath, addMessage, 'Ontology rules file for /update-ontology');
  if (!rulesContent) return;
  const response = await updateOntology(ontologyName, rulesContent);
  addMessage('system', `Ontology "${ontologyName}" updated:`);
  addMessage('output', response);
}

async function handleDeleteOntologyCommand(tuiContext, args) {
  const { addMessage, agentApiDeleteOntology } = tuiContext;
  const ontologyName = args[0];
  if (!ontologyName) {
    addMessage('error', 'Usage: /delete-ontology <name>');
    return;
  }
  const response = await agentApiDeleteOntology(ontologyName);
  addMessage('system', response.message || `Ontology "${ontologyName}" deleted.`);
}


async function handleAssertCommand(tuiContext, args) {
  const { addMessage, agentApiAssertFacts, getCurrentSessionId } = tuiContext;
  const targetSessionId = _getActiveSessionIdOrError(tuiContext, 'assert');
  if (!targetSessionId) return;

  const assertText = args.join(' ');
  if (!assertText) {
    addMessage('error', 'Usage: /assert <text to assert>');
    return;
  }
  const response = await agentApiAssertFacts(targetSessionId, assertText);
  addMessage('system', `Facts asserted to session ${targetSessionId}:`);
  addMessage('output', response);
}

async function handleQueryCommand(tuiContext, args) {
  const { addMessage, agentApiQuery, getCurrentSessionId, getInitialOntologyPath, readFileContentSafe, getChatDebugMode } = tuiContext;
  const targetSessionId = _getActiveSessionIdOrError(tuiContext, 'query');
  if (!targetSessionId) return;

  const question = args.join(' ');
  if (!question) {
    addMessage('error', 'Usage: /query <question>');
    return;
  }

  let queryOntologyContent = null;
  const initialOntologyPath = getInitialOntologyPath();
  if (initialOntologyPath) {
    // readFileContentSafe is passed in tuiContext and expects (filePath, addMessageCallback, fileDescription)
    queryOntologyContent = readFileContentSafe(initialOntologyPath, addMessage, 'Startup ontology for query context');
  }
  // If readFileContentSafe returns null (error occurred), it would have already called addMessage.
  // So, we should bail out if initialOntologyPath was provided but content couldn't be read.
  if (initialOntologyPath && !queryOntologyContent && initialOntologyPath !== '') return;


  const chatDebugMode = getChatDebugMode();
  const response = await agentApiQuery(
    targetSessionId,
    question,
    { style: 'conversational', debug: chatDebugMode },
    queryOntologyContent
  );
  addMessage('system', `Query to session ${targetSessionId}: "${question}"`);
  addMessage('mcr', response.answer || JSON.stringify(response));

  // Conditional logging based on debug mode and response content
  if (chatDebugMode) { // Check debug mode first
    if (response.debug) addMessage('output', { debugInfo: response.debug });
    if (response.translation) addMessage('output', { translation: response.translation });
    if (response.prologOutput) addMessage('output', { prolog: response.prologOutput });
  } else if (response.debug && typeof response.debug === 'object' && Object.keys(response.debug).length > 0 && response.answer) {
    // If not in chatDebugMode but server sent debug info anyway (e.g. server-side forced debug)
    // and there is an answer, show a concise version or just a note.
    // For now, only show if chatDebugMode is explicitly on.
  }
}

async function handleExplainCommand(tuiContext, args) {
  const { addMessage, agentApiExplainQuery, getCurrentSessionId } = tuiContext;
  const targetSessionId = _getActiveSessionIdOrError(tuiContext, 'explain');
  if (!targetSessionId) return;

  const explainQuestion = args.join(' ');
  if (!explainQuestion) {
    addMessage('error', 'Usage: /explain <question>');
    return;
  }
  // Ensure agentApiExplainQuery is passed in tuiContext from McrApp
  const response = await agentApiExplainQuery(targetSessionId, explainQuestion);
  addMessage('system', `Explanation for query in session ${targetSessionId}: "${explainQuestion}"`);
  addMessage('output', response);
}
