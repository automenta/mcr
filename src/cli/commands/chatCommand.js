/* eslint-disable no-console */
const path = require('path'); // Added path import
const api = require('../api'); // Import all exported functions from api.js
// Axios, spawn, path are no longer directly needed here if serverManager handles them.
// ConfigManager is still needed for other parts.
const ConfigManager = require('../../config');
const {
  isServerAliveAsync,
  startMcrServerAsync,
} = require('../tuiUtils/serverManager');
// const chatDemos = require('../tuiUtils/chatDemos'); // No longer needed here
const tuiCmdHandlers = require('../tuiUtils/tuiCommandHandlers'); // Import new command handlers
const { parseTuiCommandArgs, readFileContentSafe, delay } = require('../utils'); // Ensure all utils are from here or passed in context

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
  const { exit } = useApp();
  const [messages, setMessages] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isExiting, setIsExiting] = React.useState(false);
  const [currentSessionId, setCurrentSessionId] =
    React.useState(initialSessionId);
  const [serverStatus, setServerStatus] = React.useState('Checking...');
  const [activeLlmInfo, setActiveLlmInfo] = React.useState(
    'Provider: N/A, Model: N/A'
  ); // New state for LLM info
  const [currentOntologyDisplay] = React.useState( // _setCurrentOntologyDisplay removed
    initialOntologyPath ? path.basename(initialOntologyPath) : 'None'
  );
  // const [isDemoRunning, setIsDemoRunning] = React.useState(false); // Removed
  const [chatDebugMode, setChatDebugMode] = React.useState(false);

  React.useEffect(() => {
    const initAppAsync = async () => {
      const welcomeMessages = [
        {
          type: 'system',
          text: 'Welcome to MCR. Type /help for a list of commands.',
        },
      ];
      if (currentSessionId) {
        welcomeMessages.push({
          type: 'system',
          text: `Active session: ${currentSessionId}.`,
        });
      } else {
        welcomeMessages.push({
          type: 'system',
          text: 'No active session. Use /create-session or chat to start one.',
        });
      }
      if (initialOntologyPath) {
        welcomeMessages.push({
          type: 'system',
          text: `Startup ontology context: ${path.basename(initialOntologyPath)} (used for NL to Rules context if applicable).`,
        });
      }
      setMessages(welcomeMessages);
      await checkServerStatusAsync();
    };

    initApp();
  }, [currentSessionId, initialOntologyPath, checkServerStatusAsync]); // Added checkServerStatusAsync to dependencies

  /**
   * Adds a message to the TUI output.
   * @param {string} type - Type of message (e.g., 'system', 'user', 'mcr', 'error', 'output').
   * @param {string|object} text - The message content. Objects will be stringified.
   */
  const addMessage = (type, text) => {
    const messageText =
      typeof text === 'object' && text !== null
        ? JSON.stringify(text, null, 2)
        : text;
    setMessages((prev) => [...prev, { type, text: messageText }]);
  };

  /**
   * Checks the MCR server status and updates the TUI.
   * @returns {Promise<object|null>} Server status data or null on failure.
   */

  const checkServerStatusAsync = async () => {
    // Renamed
    try {
      const statusData = await tuiGetServerStatus(); // Use the new helper
      setServerStatus(`OK (v${statusData?.version})`);
      if (statusData?.activeLlmProvider) {
        setActiveLlmInfo(
          `LLM: ${statusData.activeLlmProvider} (${statusData.activeLlmModel || 'default'})`
        );
      } else {
        setActiveLlmInfo('LLM: N/A');
      }
      return statusData;
    } catch (error) {
      setServerStatus('Unavailable');
      setActiveLlmInfo('LLM: N/A'); // Reset on error
      const errorMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'Unknown error';
      addMessage('error', `Server status check failed: ${errorMessage}`);
      return null;
    }
  };

  // Demo implementations were in ../tuiUtils/chatDemos.js but are no longer called from here.

  // Construct tuiContext to pass to command handlers
  // This includes state setters, utility functions, and API helpers
  const tuiContext = {
    addMessage,
    // setIsDemoRunning, // Removed
    setCurrentSessionId,
    setChatDebugMode,
    getChatDebugMode: () => chatDebugMode,
    getCurrentSessionId: () => currentSessionId,
    getInitialOntologyPath: () => initialOntologyPath,
    // Pass state setters for status bar
    setServerStatus,
    setActiveLlmInfo,

    // Utilities from ../utils required by demos or commands
    delay, // Already imported at top level of file
    readFileContentSafe, // Already imported at top level of file
    parseTuiCommandArgs, // Already imported at top level of file

    // API functions (already aliased at the top of the file or available via api.*)
    // Ensure all functions used by handlers are included in tuiContext.
    agentApiCreateSession,
    agentApiAssertFacts, // Used by handleAssertCommand
    agentApiQuery, // Used by handleQueryCommand
    agentApiDeleteSession,
    agentApiAddOntology,
    agentApiDeleteOntology,
    tuiGetServerStatus,
    agentApiGetSession: api.getSession,
    agentApiExplainQuery: api.explainQuery, // Added for /explain

    // Add other direct api functions that will be used by handlers
    // (as opposed to the top-level aliased ones if names differ or for clarity)
    listOntologies: api.listOntologies,
    getOntology: api.getOntology,
    updateOntology: api.updateOntology,
    // addOntology: api.addOntology, // Covered by agentApiAddOntology
    // deleteOntology: api.deleteOntology, // Covered by agentApiDeleteOntology
    nlToRules: api.nlToRules,
    rulesToNl: api.rulesToNl,
    listPrompts: api.listPrompts,
    debugFormatPrompt: api.debugFormatPrompt,
  };

  /**
   * Handles slash commands entered by the user.
   * @param {string} command - The command name (without the slash).
   * @param {string[]} args - Arguments provided with the command.
   */
  // eslint-disable-next-line no-restricted-syntax
  const handleCommand = async (command, args) => {
    // if (isDemoRunning) { // Removed demo check
    //   addMessage(
    //     'error',
    //     'A demo is currently running. Please wait for it to complete.'
    //   );
    //   return;
    // }
    addMessage('command', `Executing: /${command} ${args.join(' ')}`);
    setInputValue('');
    // Unused variables removed: targetSessionId, ontologyName, filePath, rulesContent, response, text, templateName, inputVariablesJson, parsedArgs, _options

    try {
      // Pass tuiContext to all handlers
      switch (command) {
        case 'help': {
          await tuiCmdHandlers.handleHelpCommand(tuiContext, args);
          break;
        }
        case 'status': {
          // checkServerStatusAsync was the McrApp local state-updating function.
          // The new handleStatusCommand in tuiCmdHandlers will call the api and use addMessage.
          // It also now takes setServerStatus and setActiveLlmInfo via tuiContext to update McrApp's state.
          await tuiCmdHandlers.handleStatusCommand(tuiContext, args);
          break;
        }
        case 'create-session': {
          await tuiCmdHandlers.handleCreateSessionCommand(tuiContext, args);
          break;
        }
        case 'get-session': {
          await tuiCmdHandlers.handleGetSessionCommand(tuiContext, args);
          break;
        }
        case 'delete-session': {
          await tuiCmdHandlers.handleDeleteSessionCommand(tuiContext, args);
          break;
        }
        case 'assert': {
          await tuiCmdHandlers.handleAssertCommand(tuiContext, args);
          break;
        }
        case 'query': {
          await tuiCmdHandlers.handleQueryCommand(tuiContext, args);
          break;
        }
        case 'explain': {
          await tuiCmdHandlers.handleExplainCommand(tuiContext, args);
          break;
        }
        case 'list-ontologies': {
          await tuiCmdHandlers.handleListOntologiesCommand(tuiContext, args);
          break;
        }
        case 'get-ontology': {
          await tuiCmdHandlers.handleGetOntologyCommand(tuiContext, args);
          break;
        }
        case 'add-ontology': {
          await tuiCmdHandlers.handleAddOntologyCommand(tuiContext, args);
          break;
        }
        case 'update-ontology': {
          await tuiCmdHandlers.handleUpdateOntologyCommand(tuiContext, args);
          break;
        }
        case 'delete-ontology': {
          await tuiCmdHandlers.handleDeleteOntologyCommand(tuiContext, args);
          break;
        }
        case 'nl2rules': {
          await tuiCmdHandlers.handleNl2RulesCommand(tuiContext, args);
          break;
        }
        case 'rules2nl': {
          await tuiCmdHandlers.handleRules2NlCommand(tuiContext, args);
          break;
        }
        case 'list-prompts': {
          await tuiCmdHandlers.handleListPromptsCommand(tuiContext, args);
          break;
        }
        case 'show-prompt': {
          await tuiCmdHandlers.handleShowPromptCommand(tuiContext, args);
          break;
        }
        case 'debug-prompt': {
          await tuiCmdHandlers.handleDebugPromptCommand(tuiContext, args);
          break;
        }
        // case 'run-demo': { // Removed /run-demo command case
        //   const demoName = args[0];
        //   if (demoName === 'simpleQA' || demoName === 'simpleqa') {
        //     await chatDemos.runSimpleQADemo(tuiContext);
        //   } else if (
        //     demoName === 'family' ||
        //     demoName === 'familyOntology' ||
        //     demoName === 'familyontology'
        //   ) {
        //     await chatDemos.runFamilyOntologyDemo(tuiContext);
        //   } else {
        //     addMessage(
        //       'error',
        //       `Unknown demo: ${demoName}. Available: simpleQA, family`
        //     );
        //   }
        //   break;
        // }
        // Note: There was a duplicated 'toggle-debug-chat' case that seemed to be a copy-paste error
        // of the 'run-demo' logic. I am removing the duplicated one and keeping the correct one.
        case 'toggle-debug-chat': {
          await tuiCmdHandlers.handleToggleDebugChatCommand(tuiContext, args);
          break;
        }
        case 'exit':
        case 'quit': {
          // This command involves direct calls to setIsExiting and exit() from useApp(),
          // so it's best handled directly within McrApp unless those are passed to context too.
          setIsExiting(true);
          addMessage('system', 'Exiting application...');
          await onExitTrigger(currentSessionId); // onExitTrigger is from McrApp props
          exit(); // exit is from useApp()
          return; // Important to return after exit
        }
        default:
          addMessage(
            'error',
            `Unknown command: /${command}. Type /help for available commands.`
          );
      }
    } catch (error) {
      const errorSource = error.isAxiosError ? 'API Error' : 'Command Error';
      const errorMessage =
        error.response?.data?.error ||
        error.response?.data?.message ||
        error.message ||
        'An unexpected error occurred';
      addMessage('error', `${errorSource} for /${command}: ${errorMessage}`);
      if (error.response?.data && typeof error.response.data === 'object') {
        const detailText = JSON.stringify(error.response.data, null, 2);
        if (detailText !== errorMessage) {
          setMessages((prev) => [
            ...prev,
            { type: 'output', text: detailText },
          ]);
        }
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string' &&
        error.response.data !== errorMessage
      ) {
        setMessages((prev) => [
          ...prev,
          { type: 'output', text: error.response.data },
        ]);
      }
    }
  };

  /**
   * Handles regular chat messages (non-commands).
   * Creates a session if one isn't active, then submits the message.
   * @param {string} queryString - The chat message from the user.
   */
  // eslint-disable-next-line no-restricted-syntax
  const handleChatMessage = async (queryString) => {
    // if (isDemoRunning) { // Removed demo check
    //   addMessage(
    //     'error',
    //     'A demo is currently running. Please wait for it to complete before sending chat messages.'
    //   );
    //   setInputValue(queryString); // Keep query in input
    //   return;
    // }
    if (!currentSessionId) {
      try {
        addMessage('system', 'No active session. Creating one for chat...');
        const sessionData = await api.createSession(); // Use helper
        setCurrentSessionId(sessionData.sessionId);
        addMessage('system', `New session for chat: ${sessionData.sessionId}`);
        await submitMessageToSession(queryString, sessionData.sessionId);
      } catch (error) {
        const errorMessage =
          error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message ||
          'Failed to create session for chat.';
        addMessage('error', `Session Creation Error: ${errorMessage}`);
        setInputValue(queryString); // Keep query in input if session creation failed
      }
      return;
    }
    await submitMessageToSession(queryString, currentSessionId);
  };

  /**
   * Submits a query message to a specific MCR session.
   * @param {string} queryString - The query/chat message.
   * @param {string} sessionIdForQuery - The ID of the session to query.
   */
  // eslint-disable-next-line no-restricted-syntax
  const submitMessageToSession = async (queryString, sessionIdForQuery) => {
    addMessage('user', queryString);
    setInputValue('');
    try {
      let dynamicOntologyContent = null;
      if (initialOntologyPath) {
        dynamicOntologyContent = readFileContentSafe(
          initialOntologyPath,
          addMessage,
          'Startup ontology context for chat'
        );
      }

      const response = await api.query(
        sessionIdForQuery,
        queryString,
        { style: 'conversational', debug: chatDebugMode },
        dynamicOntologyContent
      );

      const mcrResponse = response.answer || JSON.stringify(response);
      addMessage('mcr', mcrResponse);
      if (chatDebugMode && response.debug)
        addMessage('output', { debugInfo: response.debug });
      if (chatDebugMode && response.translation)
        addMessage('output', { translation: response.translation });
      if (chatDebugMode && response.prologOutput)
        addMessage('output', { prolog: response.prologOutput });
    } catch (error) {
      const errorMessage =
        error.response?.data?.error?.message ||
        error.response?.data?.message ||
        error.message ||
        'An API error occurred during chat';
      addMessage('error', `Chat Error: ${errorMessage}`);
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
        <Text color="cyan">🤖 MCR TUI</Text>
        <Spacer />
        <Text>🏷️ Session: {currentSessionId || 'None'}</Text>
        <Spacer />
        <Text>📚 Ontology: {currentOntologyDisplay}</Text>
        <Spacer />
        <Text>🧠 {activeLlmInfo}</Text>
        <Spacer />
        <Text>⚡ Server: {serverStatus}</Text>
        <Spacer />
        <Text>🐞 ChatDebug: {chatDebugMode ? 'ON' : 'OFF'}</Text>
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

  const programOpts = command.parent.opts();
  const initialSessionId = null;
  let initialOntologyPath = null; // Store path from -o option

  if (programOpts.json) {
    console.log(
      JSON.stringify({
        error: 'TUI_MODE_NO_JSON',
        message: 'The TUI mode does not support JSON output.',
      })
    );
    process.exit(1);
  }

  if (options.ontology) {
    initialOntologyPath = options.ontology; // Store path for McrApp to use/display
  }

  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl;

  // These variables will be local to startAppAsync
  let mcrServerProcess = null;
  let mcrServerStartedByThisTui = false;

  try {
    // let _serverJustStarted = false; // This variable seems unused, removing
    if (!(await isServerAliveAsync(healthCheckUrl, 1, 100))) {
      console.log('MCR server not detected. Attempting to start it...');
      try {
        // startMcrServerAsync now returns the process
        mcrServerProcess = await startMcrServerAsync(programOpts);
        mcrServerStartedByThisTui = true;
        // serverStartedByChat = true; // This global is removed
        console.log(
          'MCR server process started. Waiting a moment for it to initialize...'
        );
        await new Promise((resolve) => setTimeout(resolve, 1500)); // Initial delay for server to boot
        if (!(await isServerAliveAsync(healthCheckUrl, 3, 500))) {
          throw new Error(
            'Server process was started but did not become healthy in time.'
          );
        }
        // _serverJustStarted = true;
      } catch (serverStartError) {
        console.error(
          `Critical: Failed to start MCR server: ${serverStartError.message}. Please start it manually and try again.`
        );
        process.exit(1);
      }
    } else {
      // console.log('Existing MCR server detected.');
    }

    const performCleanup = async (activeSessionId) => {
      if (activeSessionId) {
        console.log(`Terminating TUI session ${activeSessionId}...`);
        try {
          await api.deleteSession(activeSessionId);
          console.log(`TUI Session ${activeSessionId} terminated.`);
        } catch (error) {
          const errorMsg =
            error.response?.data?.error?.message ||
            error.response?.data?.message ||
            error.message ||
            'Unknown error during session termination';
          console.error(
            `Failed to terminate TUI session ${activeSessionId}: ${errorMsg}`
          );
        }
      }
      // Use the locally managed mcrServerProcess and mcrServerStartedByThisTui
      if (mcrServerProcess && mcrServerStartedByThisTui) {
        console.log('Stopping MCR server started by this TUI session...');
        try {
          if (mcrServerProcess.pid) {
            process.kill(mcrServerProcess.pid, 'SIGTERM');
            console.log(
              `Kill signal sent to MCR server process (PID: ${mcrServerProcess.pid}).`
            );
          }
        } catch (e) {
          console.warn(
            `Could not send kill signal to server process (PID: ${mcrServerProcess.pid}). It might require manual termination. Error: ${e.message}`
          );
        }
      }
    };

    // Global serverProcess and serverStartedByChat are removed, no need to update them here.

    const app = render(
      <McrApp
        initialSessionId={initialSessionId}
        initialOntologyContent={initialOntologyPath}
        programOpts={programOpts}
        onExitTrigger={performCleanup}
      />,
      { exitOnCtrlC: false }
    );

    await app.waitUntilExit();
  } catch (error) {
    console.error(
      `\nCritical error during TUI initialization or operation: ${error.message}`
    );
    if (
      error.code === 'ECONNREFUSED' &&
      !mcrServerStartedByThisTui // Check the local variable
      // && !serverStartedByChat // This global is removed
    ) {
      console.error(
        'This might be because the MCR server is not running and could not be started automatically.'
      );
    }
    // Use local variables for cleanup
    if (mcrServerProcess && mcrServerStartedByThisTui) {
      console.log('Attempting to stop MCR server due to critical error...');
      try {
        if (mcrServerProcess.pid) process.kill(mcrServerProcess.pid, 'SIGTERM');
      } catch (e) {
        console.warn(
          'Could not send kill signal to server process during error exit.',
          e.message
        );
      }
    }
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description(
      'Start the interactive MCR TUI. Starts the server if not running.'
    )
    .option(
      '-o, --ontology <file>',
      'Specify an ontology file to load at startup (its name will be shown in status)'
    )
    .action(startAppAsync);
};
