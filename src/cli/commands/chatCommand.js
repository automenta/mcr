const React = require('react');
// const { render, Box, Text, useApp, useInput, Spacer } = require('ink'); // Replaced with dynamic import
// const TextInput = require('ink-text-input').default; // Replaced with dynamic import

const config = require('../../config'); // New config
const api = require('../api'); // New API with TUI helpers
const {
  startMcrServerAsync,
  isServerAliveAsync,
} = require('../tuiUtils/serverManager');
const tuiCommandHandlers = require('../tuiUtils/tuiCommandHandlers');
// readFileContentSafe and parseTuiCommandArgs are not used by the simplified command handlers

let serverProcess = null; // To keep track of the spawned server process

const McrApp = ({
  initialSessionIdFromArgs,
  onExitTrigger,
  Box,
  Text,
  useApp,
  useInput,
  Spacer,
  TextInput,
}) => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isExiting, setIsExiting] = React.useState(false);
  const [currentSessionId, setCurrentSessionId] = React.useState(
    initialSessionIdFromArgs
  );

  // Status bar state
  const [serverStatusDisplay, setServerStatusDisplay] =
    React.useState('Checking...');
  const [llmInfoDisplay, setLlmInfoDisplay] = React.useState('LLM: Unknown');
  const [sessionDisplay, setSessionDisplay] = React.useState(
    initialSessionIdFromArgs || 'None'
  );

  const addMessage = React.useCallback((type, text) => {
    const messageText =
      typeof text === 'object' && text !== null
        ? JSON.stringify(text, null, 2)
        : String(text);
    setMessages((prev) => [
      ...prev,
      { type, text: messageText, timestamp: Date.now() },
    ]);
  }, []);

  const updateStatusBar = React.useCallback(async () => {
    try {
      const status = await api.getServerStatus(); // Uses non-exiting version
      if (status.success) {
        setServerStatusDisplay('Online');
        // Assuming status.data has fields like llmProvider, llmModel from a /status endpoint
        // The old / endpoint returns name, version, description.
        // We need to ensure the / endpoint or a dedicated /status endpoint provides LLM info.
        // For now, let's assume it might be in status.data.config or similar.
        // Let's look at old mcr.js root response: { status, name, version, description }
        // Let's look at new app.js -> routes.js -> apiHandlers.js GET /
        // new apiHandlers.js getRoot just returns { status: 'ok', message: 'MCR API is running.' }
        // This needs to be enhanced or use config directly for LLM info for status bar.
        // For now, use config directly for LLM info, and API for server liveness.
        const llmProvider = config.llm.provider;
        const llmModel = config.llm[llmProvider]?.model || 'default';
        setLlmInfoDisplay(`LLM: ${llmProvider} (${llmModel})`);
      } else {
        setServerStatusDisplay(status.status || 'Offline'); // 'offline', 'error_response'
        setLlmInfoDisplay('LLM: N/A');
      }
    } catch (e) {
      // Should not happen if getServerStatus handles its own errors
      setServerStatusDisplay('Error');
      setLlmInfoDisplay('LLM: Error');
      addMessage('error', `Status Bar Update Error: ${e.message}`);
    }
  }, [addMessage]);

  React.useEffect(() => {
    setSessionDisplay(currentSessionId || 'None');
  }, [currentSessionId]);

  React.useEffect(() => {
    addMessage('system', 'Welcome to MCR Chat. Type /help for commands.');
    if (currentSessionId) {
      addMessage('system', `Active session: ${currentSessionId}.`);
    } else {
      addMessage(
        'system',
        'No active session. Chat to start one or use /create-session.'
      );
    }
    updateStatusBar(); // Initial status check
    const statusInterval = setInterval(updateStatusBar, 30000); // Update status bar every 30s
    return () => clearInterval(statusInterval);
  }, [addMessage, currentSessionId, updateStatusBar]);

  const tuiContext = {
    addMessage,
    setCurrentSessionId,
    getCurrentSessionId: () => currentSessionId,
    api, // Provide all of api.js, handlers will use specific TUI functions
    // For status command to update McrApp's view of core status (not used by simplified handlers)
    // setServerStatusDisplay,
    // setLlmInfoDisplay,
  };

  const handleCommand = async (command, args) => {
    addMessage('command', `/${command} ${args.join(' ')}`);
    setInputValue(''); // Clear input after command execution attempt

    const handler =
      tuiCommandHandlers[
        `handle${command.charAt(0).toUpperCase() + command.slice(1)}CommandAsync`
      ];
    if (handler) {
      try {
        await handler(tuiContext, args);
      } catch (error) {
        addMessage('error', `Command Error (/${command}): ${error.message}`);
        console.error(error); // Log full error to console for debugging
      }
    } else if (command === 'assert-sir') {
      // Handle /assert-sir directly for now
      if (!currentSessionId) {
        addMessage('error', 'No active session. Use /create-session first.');
        return;
      }
      if (args.length === 0) {
        addMessage('error', 'Usage: /assert-sir <natural language text>');
        return;
      }
      const textToAssert = args.join(' ');
      addMessage('system', `Asserting (SIR): "${textToAssert}"`);
      try {
        // Assuming api.js will have a tui wrapper for assertNLToSessionWithSIR
        // If not, we'd call the direct mcrService function or construct the API call.
        // For now, let's assume api.assertSirTui exists or we add it.
        // Let's mock what the call would look like if it was direct to a hypothetical api.assertSirTui
        const result = await api.assertSirTui(currentSessionId, textToAssert); // This function needs to be added to api.js
        if (result.success) {
          addMessage('mcr', `Asserted (SIR): ${result.message}`);
          if (result.addedFacts) {
            addMessage('output', `Added: ${result.addedFacts.join(' ')}`);
          }
        } else {
          addMessage(
            'error',
            `Assert (SIR) failed: ${result.message || result.error}`
          );
        }
        if (result.debugInfo) {
          addMessage(
            'output',
            `SIR Debug: ${JSON.stringify(result.debugInfo, null, 2)}`
          );
        }
      } catch (err) {
        addMessage('error', `Assert (SIR) Error: ${err.message}`);
        console.error(err);
      }
    } else if (command === 'exit' || command === 'quit') {
      setIsExiting(true);
      addMessage('system', 'Exiting application...');
      await onExitTrigger(currentSessionId, serverProcess); // Pass serverProcess for potential cleanup
      exit();
    } else {
      addMessage(
        'error',
        `Unknown command: /${command}. Type /help for available commands.`
      );
    }
  };

  const handleChatMessage = async (chatText) => {
    let sessId = currentSessionId;
    addMessage('user', chatText);
    setInputValue('');

    if (!sessId) {
      try {
        addMessage('system', 'No active session. Creating one for chat...');
        const sessionData = await api.createSessionTui();
        setCurrentSessionId(sessionData.sessionId);
        sessId = sessionData.sessionId;
        addMessage('system', `New session for chat: ${sessionData.sessionId}`);
      } catch (error) {
        addMessage('error', `Session Creation Error: ${error.message}`);
        setInputValue(chatText); // Put text back in input
        return;
      }
    }

    try {
      // Using api.queryTui. Options are simplified for basic chat.
      const response = await api.queryTui(sessId, chatText, {
        style: 'conversational',
        debug: false,
      });
      const mcrResponseText = response.answer || JSON.stringify(response);
      addMessage('mcr', mcrResponseText);
      if (response.debug) {
        // If server sends debug info anyway
        addMessage(
          'output',
          `Debug Info: ${JSON.stringify(response.debug, null, 2)}`
        );
      }
    } catch (error) {
      addMessage('error', `Chat Error: ${error.message}`);
      console.error(error);
    }
  };

  const handleSubmit = async (input) => {
    if (!input.trim() || isExiting) return;

    if (input.startsWith('/')) {
      const [command, ...args] = input.slice(1).trim().split(/\s+/);
      await handleCommand(command.toLowerCase(), args);
    } else {
      await handleChatMessage(input);
    }
  };

  useInput(async (_inputChars, key) => {
    if (isExiting) return;
    if (key.ctrl && key.c) {
      setIsExiting(true);
      addMessage('system', 'Ctrl+C detected. Exiting...');
      await onExitTrigger(currentSessionId, serverProcess);
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
        <Text>🏷️ Session: {sessionDisplay}</Text>
        <Spacer />
        <Text>🧠 {llmInfoDisplay}</Text>
        <Spacer />
        <Text>⚡ Server: {serverStatusDisplay}</Text>
      </Box>

      {/* Main Content Area */}
      <Box flexGrow={1} flexDirection="column" overflowY="auto" padding={1}>
        {messages.map((msg) => (
          <Box
            key={msg.timestamp + msg.text.slice(0, 10)}
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
          />
        </Box>
      )}
    </Box>
  );
};

async function startAppAsync(optionsFromCommander, commandInstance) {
  if (!process.stdin.isTTY) {
    console.error(
      'ERROR: MCR Chat TUI requires an interactive terminal (TTY).'
    );
    process.exit(1);
  }

  const programOpts = commandInstance.parent.opts(); // Global opts like --json, --config
  const initialSessionId = null; // TUI starts without a session unless one is passed/restored

  // Dynamically import Ink and TextInput
  const { render, Box, Text, useApp, useInput, Spacer } = await import('ink');
  const TextInput = (await import('ink-text-input')).default;

  // Auto-start server logic
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  let serverStartedByChat = false;

  const alive = await isServerAliveAsync(serverUrl);
  if (!alive) {
    try {
      console.log(
        `MCR server not detected at ${serverUrl}. Attempting to start...`
      );
      serverProcess = await startMcrServerAsync(programOpts); // Store server process globally
      serverStartedByChat = true;
      console.log(
        'MCR server started by TUI. Waiting for it to be fully ready...'
      );
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Give server a couple of seconds
      if (!(await isServerAliveAsync(serverUrl))) {
        console.error(
          'Server was started but did not become healthy. Exiting TUI.'
        );
        if (serverProcess) serverProcess.kill();
        process.exit(1);
      }
      console.log('Server is now alive.');
    } catch (error) {
      console.error(
        `Failed to start MCR server automatically: ${error.message}`
      );
      console.error(
        'Please start the MCR server manually (e.g., `node mcr.js` or `mcr-cli start-server`) and try again.'
      );
      process.exit(1);
    }
  } else {
    console.log(`MCR server already running at ${serverUrl}`);
  }

  const performCleanup = async (activeSessionId, spawnedServerProcess) => {
    // Session cleanup is handled by user commands or if TUI created one for chat temporarily.
    // For now, TUI doesn't auto-delete sessions it didn't create for a specific interaction.
    if (spawnedServerProcess && serverStartedByChat) {
      console.log('\nShutting down MCR server started by TUI...');
      try {
        // Attempt graceful shutdown by sending SIGINT to the detached process
        // This relies on the server having proper SIGINT handling to shut down cleanly.
        process.kill(spawnedServerProcess.pid, 'SIGINT');
        console.log(
          `Sent SIGINT to server process ${spawnedServerProcess.pid}.`
        );
        // Optionally, wait a moment and then force kill if still alive
        // setTimeout(() => { if (spawnedServerProcess && !spawnedServerProcess.killed) spawnedServerProcess.kill('SIGKILL'); }, 3000);
      } catch (e) {
        console.error(
          `Error attempting to stop server process ${spawnedServerProcess.pid}: ${e.message}`
        );
        console.error('You may need to stop it manually.');
      }
    }
  };

  try {
    const appInstance = render(
      <McrApp
        initialSessionIdFromArgs={initialSessionId}
        onExitTrigger={performCleanup}
        Box={Box}
        Text={Text}
        useApp={useApp}
        useInput={useInput}
        Spacer={Spacer}
        TextInput={TextInput}
      />,
      { exitOnCtrlC: false } // Manual Ctrl+C handling is inside McrApp
    );
    await appInstance.waitUntilExit(); // Keep TUI running
  } catch (error) {
    console.error(`\nCritical error during TUI operation: ${error.message}`);
    console.error(error.stack);
    if (serverProcess && serverStartedByChat) {
      console.log(
        'Attempting to shut down server started by TUI due to critical error...'
      );
      serverProcess.kill();
    }
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start the interactive MCR Chat TUI.')
    // No -o ontology option for simplified TUI
    .action(startAppAsync);
};
