/* eslint-disable no-console */
const path = require('path'); // Added path import
const ConfigManager = require('../../config');
const mcrCore = require('../../mcrCore'); // Added for direct MCR interaction
const api = require('../api'); // Still needed for some API helpers if not all are moved to mcrCore facades yet, or for tuiCmdHandlers that might still use it
// const {
//   isServerAliveAsync,
//   startMcrServerAsync,
// } = require('../tuiUtils/serverManager'); // Removed server management
const tuiCmdHandlers = require('../tuiUtils/tuiCommandHandlers');
const { parseTuiCommandArgs, readFileContentSafe, delay } = require('../utils');

// Ink and React will be required dynamically inside startAppAsync
let React;
let render, Box, Text, useApp, useInput, Spacer; // Removed Newline, Static
let TextInput;

// Demo functions will use the destructured methods from the 'api' import.
// e.g. api.createSession, api.assertFacts etc.
// The aliases like agentApiCreateSession are kept for minimal changes in demo logic code.
const {
  createSession: agentApiCreateSession,
  assertFacts: agentApiAssertFacts,
  query: agentApiQuery, // This is the generic query helper from api.js
  deleteSession: agentApiDeleteSession,
  addOntology: agentApiAddOntology,
  deleteOntology: agentApiDeleteOntology,
  getServerStatus: tuiGetServerStatus, // Alias for clarity
} = api;

// parseTuiCommandArgs is now imported from ../utils

// serverProcess and serverStartedByChat are now managed within startAppAsync

/**
 * The main Ink application component for the MCR TUI.
 * Manages state for messages, input, session, server status, and demos.
 * Handles user input for commands and chat messages.
 * @param {object} props - Component props.
 * @param {string|null} props.initialSessionId - An initial session ID to use, if any.
 * @param {string|null} props.initialOntologyContent - Path to a startup ontology file, if provided via -o.
 * @param {object} props.programOpts - Commander program options.
 * @param {function} props.onExitTrigger - Async function to call before exiting (for cleanup).
 */
const McrApp = ({
  initialSessionId,
  initialOntologyContent: initialOntologyPath,
  programOpts: _programOpts, // Marked unused
  onExitTrigger,
}) => {
/**
 * The main Ink application component for the MCR TUI.
 * Manages state for messages, input, session, server status, and demos.
 * @param {object} props - Component props.
 * @param {string|null} props.initialSessionId - An initial session ID to use, if any.
 * @param {object} props.programOpts - Commander program options. // This seems unused now
 * @param {function} props.onExitTrigger - Async function to call before exiting (for cleanup).
 */
const McrApp = ({
  initialSessionId,
  // initialOntologyContent: initialOntologyPath, // Removed
  // programOpts: _programOpts, // Marked unused, removing
  onExitTrigger,
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isExiting, setIsExiting] = React.useState(false);
  const [currentSessionId, setCurrentSessionId] = React.useState(initialSessionId);
  const [mcrCoreStatus, setMcrCoreStatus] = React.useState('Initializing...');
  const [activeLlmInfo, setActiveLlmInfo] = React.useState('LLM: N/A');

  const addMessage = React.useCallback((type, text) => {
    const messageText = typeof text === 'object' && text !== null ? JSON.stringify(text, null, 2) : text;
    setMessages((prev) => [...prev, { type, text: messageText }]);
  }, []);

  const checkMcrCoreStatus = React.useCallback(() => {
    if (mcrCore.isInitialized() && mcrCore.LlmService) {
      setMcrCoreStatus('Initialized');
      setActiveLlmInfo(`LLM: ${mcrCore.LlmService.getActiveProviderName()} (${mcrCore.LlmService.getActiveModelName() || 'default'})`);
    } else if (mcrCore.isInitialized()) {
      setMcrCoreStatus('Initialized (LLM Error)');
      setActiveLlmInfo('LLM: Error/Unavailable');
      addMessage('error', 'MCR Core is initialized, but LLM Service is not properly configured or available.');
    }
    else {
      setMcrCoreStatus('Not Initialized');
      setActiveLlmInfo('LLM: N/A');
      addMessage('error', 'MCR Core is not initialized. Chat functionality may be impaired.');
    }
  }, [addMessage]); // Removed dependencies on setMcrCoreStatus, setActiveLlmInfo as they are stable setters from useState

  React.useEffect(() => {
    const welcomeMessages = [
      { type: 'system', text: 'Welcome to MCR Chat. Type /help for commands.' },
    ];
    if (currentSessionId) {
      welcomeMessages.push({ type: 'system', text: `Active session: ${currentSessionId}.` });
    } else {
      welcomeMessages.push({ type: 'system', text: 'No active session. Chat to start one or use /create-session.' });
    }
    setMessages(welcomeMessages);
    checkMcrCoreStatus(); // Check status after mcrCore should have been initialized by startAppAsync
  }, [currentSessionId, checkMcrCoreStatus, setMessages]);


  // Simplified tuiContext
  const tuiContext = {
    addMessage,
    setCurrentSessionId,
    getCurrentSessionId: () => currentSessionId,
    // For status command to update McrApp's view of core status
    setMcrCoreStatus, // Renamed from setServerStatus
    setActiveLlmInfo,

    // API functions needed by simplified commands
    // These still point to 'api.*' which are REST client calls.
    // For a fully direct TUI, these would also become mcrCore calls.
    // Plan step 5 mentions TUI using mcrCore directly.
    // So these should be mcrCore facade calls.
    // For now, let's assume they are placeholders and will be replaced if handler logic is kept.
    // However, for a *simple* chat, many handlers are removed.
    // CreateSession and DeleteSession are the main ones.
    agentApiCreateSession: mcrCore.createSession, // Directly use mcrCore
    agentApiDeleteSession: mcrCore.deleteSession, // Directly use mcrCore
    // getStatus will be custom for mcrCore
    // tuiGetServerStatus: api.getServerStatus, // This would be replaced by a mcrCore status check
  };

  const handleCommand = async (command, args) => {
    addMessage('command', `Executing: /${command} ${args.join(' ')}`);
    setInputValue('');

    try {
      switch (command) {
        case 'help':
          // Simplified help
          addMessage('system', 'Available commands:');
          addMessage('system', '  /help                - Show this help');
          addMessage('system', '  /status              - Show MCR Core status');
          addMessage('system', '  /create-session      - Create a new chat session');
          addMessage('system', '  /delete-session [id] - Delete current or specified session');
          addMessage('system', '  /exit, /quit         - Exit the application');
          break;
        case 'status':
          // This command should update the status bar via tuiContext setters
          // For now, it just re-checks and logs message.
          checkMcrCoreStatus(); // Re-check and update UI state
          addMessage('system', `MCR Core Status: ${mcrCoreStatus}`);
          addMessage('system', activeLlmInfo);
          break;
        case 'create-session':
          // Directly use mcrCore facade
          const newSession = mcrCore.createSession();
          setCurrentSessionId(newSession.sessionId);
          addMessage('system', `New session created: ${newSession.sessionId}`);
          addMessage('output', newSession);
          break;
        case 'delete-session':
          const targetSessionId = args[0] || currentSessionId;
          if (!targetSessionId) {
            addMessage('error', 'No session ID specified and no active session.');
            return;
          }
          // Directly use mcrCore facade
          const deleteResponse = mcrCore.deleteSession(targetSessionId);
          addMessage('system', deleteResponse.message || `Session ${targetSessionId} deleted.`);
          if (targetSessionId === currentSessionId) {
            setCurrentSessionId(null);
            addMessage('system', 'Active session cleared.');
          }
          break;
        case 'exit':
        case 'quit':
          setIsExiting(true);
          addMessage('system', 'Exiting application...');
          await onExitTrigger(currentSessionId);
          exit();
          return;
        default:
          addMessage('error', `Unknown command: /${command}. Type /help for available commands.`);
      }
    } catch (error) {
      addMessage('error', `Command Error for /${command}: ${error.message}`);
      if(error.stack) console.error(error.stack);
    }
  };

  const handleChatMessage = async (queryString) => {
    let currentSessId = currentSessionId;
    if (!currentSessId) {
      try {
        addMessage('system', 'No active session. Creating one for chat...');
        const sessionData = mcrCore.createSession(); // Use mcrCore directly
        setCurrentSessionId(sessionData.sessionId);
        currentSessId = sessionData.sessionId; // Update for current message submission
        addMessage('system', `New session for chat: ${sessionData.sessionId}`);
      } catch (error) {
        addMessage('error', `Session Creation Error: ${error.message}`);
        if(error.stack) console.error(error.stack);
        setInputValue(queryString);
        return;
      }
    }
    await submitMessageToSession(queryString, currentSessId);
  };

  const submitMessageToSession = async (queryString, sessionIdForQuery) => {
    addMessage('user', queryString);
    setInputValue('');
    try {
      // Use mcrCore.query directly. Ontology and debug options simplified.
      const response = await mcrCore.query(
        sessionIdForQuery,
        queryString,
        { style: 'conversational', debug: false } // Simplified options
      );

      const mcrResponseText = response.answer || JSON.stringify(response);
      addMessage('mcr', mcrResponseText);
      // Simplified: No complex debug output in basic chat
    } catch (error) {
      addMessage('error', `Chat Error: ${error.message}`);
      if(error.stack) console.error(error.stack);
    }
  };

  /**
   * Handles submission of the text input field.
   * Differentiates between commands (starting with '/') and chat messages.
   * @param {string} input - The text from the input field.
   */
  // eslint-disable-next-line no-restricted-syntax
  const handleSubmit = async (input) => {
    if (!input.trim() || isExiting) return;

    if (input.startsWith('/')) {
      const [command, ...args] = input.slice(1).trim().split(/\s+/);
      await handleCommand(command.toLowerCase(), args);
    } else {
      // Default to chat message
      await handleChatMessage(input);
    }
  };

  useInput(async (_inputChars, key) => {
    if (isExiting) return;
    if (key.ctrl && key.c) {
      setIsExiting(true);
      addMessage('system', 'Ctrl+C detected. Exiting...');
      await onExitTrigger(currentSessionId);
      exit();
    }
  });

  return (
    <Box
      flexDirection="column"
      width="100%"
      height="100%"
      borderStyle="round"
      borderColor="blue"
    >
      {/* Status Bar */}
      <Box paddingX={1} borderStyle="single" borderBottom borderColor="gray">
        <Text color="cyan">🤖 MCR Chat</Text>
        <Spacer />
        <Text>🏷️ Session: {currentSessionId || 'None'}</Text>
        <Spacer />
        <Text>🧠 {activeLlmInfo}</Text>
        <Spacer />
        <Text>⚡ Core: {mcrCoreStatus}</Text>
      </Box>

      {/* Main Content Area (Messages/Outputs) */}
      <Box flexGrow={1} flexDirection="column" overflowY="auto" padding={1}>
        {messages.map((msg, index) => (
          <Box
            key={index}
            marginBottom={msg.type === 'output' || msg.type === 'error' ? 0 : 1}
          >
            <Text
              color={
                msg.type === 'user'
                  ? 'greenBright'
                  : msg.type === 'mcr'
                    ? 'blueBright'
                    : msg.type === 'system'
                      ? 'yellowBright'
                      : msg.type === 'command'
                        ? 'magentaBright'
                        : msg.type === 'error'
                          ? 'redBright'
                          : 'white'
              }
            >
              {msg.type === 'user'
                ? '👤 You: '
                : msg.type === 'mcr'
                  ? '🤖 MCR: '
                  : msg.type === 'system'
                    ? '⚙️ System: '
                    : msg.type === 'command'
                      ? '⌨️ Cmd: '
                      : msg.type === 'error'
                        ? '❗ Error: '
                        : msg.type === 'output'
                          ? '  '
                          : ''}
              {msg.text}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Input Bar */}
      {!isExiting && (
        <Box borderStyle="round" paddingX={1} borderColor="cyan" borderTop>
          <Box marginRight={1}>
            <Text color="cyan">{'>'}</Text>
          </Box>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder={'Type a message or /command (e.g. /help)...'}
            // isReadOnly={isDemoRunning} // Removed
          />
        </Box>
      )}
    </Box>
  );
};

/**
 * Initializes and starts the MCR TUI application.
 * Handles server auto-start, cleanup, and renders the main Ink component.
 * @param {object} options - Command-specific options from Commander (e.g., for --ontology).
 * @param {import('commander').Command} command - The Commander command instance.
 */
async function startAppAsync(options, command) {
  // Dynamically import React and Ink components using Function constructor
  // to potentially sidestep Babel's direct handling of dynamic import()
  React = (await Function('return import("react")')()).default;
  const inkModule = await Function('return import("ink")')();
  render = inkModule.render;
  Box = inkModule.Box;
  Text = inkModule.Text;
  // Newline = inkModule.Newline; // Removed
  useApp = inkModule.useApp;
  useInput = inkModule.useInput;
  // Static = inkModule.Static; // Removed
  Spacer = inkModule.Spacer;
  TextInput = (await Function('return import("ink-text-input")')()).default;

  // Check for TTY, essential for Ink's raw mode and interactive input
  if (!process.stdin.isTTY) {
    console.error(
      'ERROR: MCR Chat TUI requires an interactive terminal (TTY).'
    );
    console.error(
      'Raw mode for input is not supported in the current environment.'
    );
    console.error(
      'Please run this command in a fully interactive terminal session.'
    );
    process.exit(1); // Exit gracefully as TUI cannot function
  }

  // const programOpts = command.parent.opts(); // programOpts seems unused by McrApp now
  const initialSessionId = null;
  // let initialOntologyPath = null; // Removed ontology option

  // if (programOpts.json) { // JSON option is global, can be checked if needed, but TUI won't output JSON
  //   console.log(JSON.stringify({ error: 'TUI_MODE_NO_JSON', message: 'The TUI mode does not support JSON output.' }));
  //   process.exit(1);
  // }

  // Removed options.ontology processing

  // Initialize MCR Core
  console.log('Initializing MCR Core for TUI Chat...');
  const globalConfig = ConfigManager.get({ exitOnFailure: true });
  try {
      await mcrCore.init(globalConfig);
      if (mcrCore.LlmService) {
          // Log to console before Ink app takes over
          console.log(`MCR Core Initialized. Using LLM Provider: ${mcrCore.LlmService.getActiveProviderName()}, Model: ${mcrCore.LlmService.getActiveModelName() || 'N/A'}`);
      } else {
           console.error('MCR Core initialized, but LlmService is not available. This might be a configuration issue.');
      }
  } catch (initError) {
      console.error(`MCR Core Initialization Failed: ${initError.message}. TUI cannot run.`);
      if (initError.stack) console.error(initError.stack);
      process.exit(1);
  }

  // Server starting logic removed

  try {
    const performCleanup = async (activeSessionId) => {
      if (activeSessionId) {
        console.log(`Terminating TUI session ${activeSessionId}...`);
        try {
          // Assuming mcrCore.deleteSession is synchronous or we don't need to await it heavily here
          // If it were async: await mcrCore.deleteSession(activeSessionId);
          mcrCore.deleteSession(activeSessionId);
          console.log(`TUI Session ${activeSessionId} terminated.`);
        } catch (error) {
          console.error(`Failed to terminate TUI session ${activeSessionId}: ${error.message}`);
        }
      }
      // Server stopping logic removed
    };

    const app = render(
      <McrApp
        initialSessionId={initialSessionId}
        // programOpts={programOpts} // Removed as it's not used by McrApp
        onExitTrigger={performCleanup}
      />,
      { exitOnCtrlC: false } // Manual Ctrl+C handling is inside McrApp
    );

    await app.waitUntilExit();
  } catch (error) {
    console.error(`\nCritical error during TUI operation: ${error.message}`);
    if (error.stack) console.error(error.stack);
    // No server process to kill anymore
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start the interactive MCR Chat TUI.')
    // .option( // Ontology option removed
    //   '-o, --ontology <file>',
    //   'Specify an ontology file to load at startup (its name will be shown in status)'
    // )
    .action(startAppAsync);
};
