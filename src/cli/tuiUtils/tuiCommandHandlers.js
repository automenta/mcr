// src/cli/tuiUtils/tuiCommandHandlers.js
// Adapted from old/src/cli/tuiUtils/tuiCommandHandlers.js, keeping it minimal.

// API functions will be passed via tuiContext from chatCommand.js,
// aliased to their old names for minimal changes to handler logic where possible,
// or called directly if straightforward.

async function handleHelpCommandAsync(tuiContext /*, args */) {
  const { addMessage } = tuiContext;
  addMessage('system', 'Available MCR Chat commands:');
  addMessage('system', '  /help                - Show this help message');
  // addMessage('system', '  /status              - Show MCR Core status'); // Status is in status bar
  addMessage('system', '  /create-session      - Create a new chat session');
  addMessage(
    'system',
    '  /delete-session [id] - Delete current or specified session'
  );
  addMessage('system', '  /exit, /quit         - Exit the application');
  addMessage('system', 'Directly type your message to chat with the MCR.');
}

async function handleCreateSessionCommandAsync(tuiContext /*, args*/) {
  const { addMessage, api, setCurrentSessionId } = tuiContext;
  // api context will have { createSessionTui, deleteSessionTui etc. }
  try {
    const response = await api.createSessionTui();
    setCurrentSessionId(response.sessionId);
    addMessage('system', `New session created: ${response.sessionId}`);
    addMessage('output', response); // Output the full session object
  } catch (error) {
    addMessage('error', `Failed to create session: ${error.message}`);
  }
}

async function handleDeleteSessionCommandAsync(tuiContext, args) {
  const {
    addMessage,
    api, // API functions from context
    getCurrentSessionId,
    setCurrentSessionId,
  } = tuiContext;
  const targetSessionId = args[0] || getCurrentSessionId();

  if (!targetSessionId) {
    addMessage('error', 'No session ID specified and no active session.');
    return;
  }
  try {
    const response = await api.deleteSessionTui(targetSessionId);
    addMessage(
      'system',
      response.message || `Session ${targetSessionId} deleted.`
    );
    if (targetSessionId === getCurrentSessionId()) {
      setCurrentSessionId(null);
      addMessage('system', 'Active session cleared.');
    }
  } catch (error) {
    addMessage(
      'error',
      `Failed to delete session ${targetSessionId}: ${error.message}`
    );
  }
}

module.exports = {
  handleHelpCommandAsync,
  handleCreateSessionCommandAsync,
  handleDeleteSessionCommandAsync,
  // Other handlers from old file are intentionally omitted for a simpler TUI.
};
