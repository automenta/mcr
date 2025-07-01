// src/cli/tuiUtils/tuiCommandHandlers.js

async function handleStatusCommandAsync(tuiContext /*, args */) {
  const { addMessage, setMcrCoreStatus, setActiveLlmInfo } = tuiContext;
  // Use mcrCore which should be initialized by now
  if (mcrCore.isInitialized() && mcrCore.LlmService) {
    const provider = mcrCore.LlmService.getActiveProviderName();
    const model = mcrCore.LlmService.getActiveModelName();
    const statusText = 'Initialized';
    const llmInfoText = `LLM: ${provider} (${model || 'default'})`;

    setMcrCoreStatus(statusText); // Update status bar in McrApp
    setActiveLlmInfo(llmInfoText); // Update status bar in McrApp

    addMessage('system', `MCR Core Status: ${statusText}`);
    addMessage('output', llmInfoText);
    // Could add more details from mcrCore if available, e.g., version from package.json
  } else if (mcrCore.isInitialized()) {
    setMcrCoreStatus('Initialized (LLM Error)');
    setActiveLlmInfo('LLM: Error/Unavailable');
    addMessage('error', 'MCR Core is initialized, but LLM Service is not properly configured or available.');
  }
  else {
    setMcrCoreStatus('Not Initialized');
    setActiveLlmInfo('LLM: N/A');
    addMessage('error', 'MCR Core is not initialized.');
  }
}

// Helper function to get current session or error
function _getActiveSessionIdOrError(tuiContext, commandName) {
  const currentSessionId = tuiContext.getCurrentSessionId();
  if (!currentSessionId) {
    tuiContext.addMessage(
      'error',
      `No active session for /${commandName}. Use /create-session or chat first.`
    );
    return null;
  }
  return currentSessionId;
}

async function handleHelpCommandAsync(tuiContext /*, args */) {
  const { addMessage } = tuiContext;
  addMessage('system', 'Available MCR Chat commands:');
  addMessage('system', '  /help                - Show this help message');
  addMessage('system', '  /status              - Show MCR Core status');
  addMessage('system', '  /create-session      - Create a new chat session');
  addMessage('system', '  /delete-session [id] - Delete current or specified session');
  addMessage('system', '  /exit, /quit         - Exit the application');
  addMessage('system', 'Directly type your message to chat with the MCR.');
  );
}

async function handleCreateSessionCommandAsync(tuiContext /*, args*/) {
  const { addMessage, agentApiCreateSession, setCurrentSessionId } = tuiContext;
  const response = await agentApiCreateSession(); // Uses the alias from chatCommand's api import
  setCurrentSessionId(response.sessionId);
  addMessage('system', `New session created: ${response.sessionId}`);
  addMessage('output', response);
}

async function handleGetSessionCommandAsync(tuiContext, args) {
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

async function handleDeleteSessionCommandAsync(tuiContext, args) {
  const {
    addMessage,
    agentApiDeleteSession,
    getCurrentSessionId,
    setCurrentSessionId,
  } = tuiContext;
  const targetSessionId = args[0] || getCurrentSessionId();
  if (!targetSessionId) {
    addMessage('error', 'No session ID specified and no active session.');
    return;
  }
  const response = await agentApiDeleteSession(targetSessionId);
  addMessage(
    'system',
    response.message || `Session ${targetSessionId} deleted.`
  );
  if (targetSessionId === getCurrentSessionId()) {
    setCurrentSessionId(null);
    addMessage('system', 'Active session cleared.');
  }
}

async function handleToggleDebugChatCommandAsync(tuiContext /*, args*/) {
  const { addMessage, getChatDebugMode, setChatDebugMode } = tuiContext;
  const newDebugMode = !getChatDebugMode();
  setChatDebugMode(newDebugMode);
  addMessage(
    'system',
    `Chat debug mode ${newDebugMode ? 'enabled' : 'disabled'}. Query responses will now ${newDebugMode ? 'include more' : 'not include extra'} details.`
  );
}

async function handleNl2RulesCommandAsync(tuiContext, args) {
  const { addMessage, nlToRules, readFileContentSafe, parseTuiCommandArgs } =
    tuiContext;
  const parsedArgs = parseTuiCommandArgs(args);
  const text = parsedArgs._.join(' ');
  if (!text) {
    addMessage(
      'error',
      'Usage: /nl2rules <text> [--facts "..."] [--ontology path/file.pl]'
    );
    return;
  }
  let nlFacts = null;
  let nlOntologyContext = null;
  if (parsedArgs.options.facts) {
    nlFacts = parsedArgs.options.facts;
  }
  if (parsedArgs.options.ontology) {
    nlOntologyContext = readFileContentSafe(
      parsedArgs.options.ontology,
      addMessage,
      'Ontology context file for /nl2rules'
    );
    if (!nlOntologyContext) return;
  }
  const response = await nlToRules(text, nlFacts, nlOntologyContext);
  addMessage('system', 'Translated NL to Rules:');
  addMessage('output', response);
}

async function handleRules2NlCommandAsync(tuiContext, args) {
  const { addMessage, rulesToNl, readFileContentSafe, parseTuiCommandArgs } =
    tuiContext;
  const parsedArgs = parseTuiCommandArgs(args);
  const filePath = parsedArgs._[0];
  if (!filePath) {
    addMessage(
      'error',
      'Usage: /rules2nl <filePath> [--style formal|conversational]'
    );
    return;
  }
  const rulesContent = readFileContentSafe(
    filePath,
    addMessage,
    'Rules file for /rules2nl'
  );
  if (!rulesContent) return;
  const style = parsedArgs.options.style || 'formal';
  const response = await rulesToNl(rulesContent, style);
  addMessage(
    'system',
    `Translated Rules from "${filePath}" to NL (style: ${style}):`
  );
  addMessage('output', response);
}

// Keep only essential command handlers for the simplified TUI
module.exports = {
  handleHelpCommandAsync,
  handleStatusCommandAsync,
  handleCreateSessionCommandAsync,
  // handleGetSessionCommandAsync, // Removed
  handleDeleteSessionCommandAsync,
  // All other handlers are removed for a streamlined chat interface
  // handleAssertCommandAsync,
  // handleQueryCommandAsync,
  // handleExplainCommandAsync,
  // handleListOntologiesCommandAsync,
  // handleGetOntologyCommandAsync,
  // handleAddOntologyCommandAsync,
  // handleUpdateOntologyCommandAsync,
  // handleDeleteOntologyCommandAsync,
  // handleNl2RulesCommandAsync,
  // handleRules2NlCommandAsync,
  // handleListPromptsCommandAsync,
  // handleShowPromptCommandAsync,
  // handleDebugPromptCommandAsync,
  // handleToggleDebugChatCommandAsync, // Debug toggle removed
};

// Placeholder for functions that were removed, to avoid breaking existing imports if any (though McrApp will be changed)
// Alternatively, just delete these functions entirely.
const removedCommandHandlerPlaceholder = async (tuiContext) => {
    tuiContext.addMessage('error', 'This command has been removed in the simplified TUI.');
};

const handleAssertCommandAsync = removedCommandHandlerPlaceholder;
const handleQueryCommandAsync = removedCommandHandlerPlaceholder;
const handleExplainCommandAsync = removedCommandHandlerPlaceholder;
const handleListOntologiesCommandAsync = removedCommandHandlerPlaceholder;
const handleGetOntologyCommandAsync = removedCommandHandlerPlaceholder;
const handleAddOntologyCommandAsync = removedCommandHandlerPlaceholder;
const handleUpdateOntologyCommandAsync = removedCommandHandlerPlaceholder;
const handleDeleteOntologyCommandAsync = removedCommandHandlerPlaceholder;
const handleNl2RulesCommandAsync = removedCommandHandlerPlaceholder;
const handleRules2NlCommandAsync = removedCommandHandlerPlaceholder;
const handleListPromptsCommandAsync = removedCommandHandlerPlaceholder;
const handleShowPromptCommandAsync = removedCommandHandlerPlaceholder;
const handleDebugPromptCommandAsync = removedCommandHandlerPlaceholder;
const handleToggleDebugChatCommandAsync = removedCommandHandlerPlaceholder;
