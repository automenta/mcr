/* eslint-disable no-console */
// const readline = require('readline'); // REMOVED
const { apiClient, API_BASE_URL, handleApiError: originalHandleApiError } = require('../api'); // Renamed for clarity
const { readOntologyFile /*, handleCliOutput */ } = require('../utils'); // handleCliOutput likely not used directly in TUI
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const ConfigManager = require('../../config');

// NEW: Ink and React imports
const React = require('react');
const { render, Box, Text, Newline, useApp, useInput, Static } = require('ink');
const TextInput = require('ink-text-input').default;

let serverProcess = null;
let serverStartedByChat = false;

// Function to check if server is alive (largely unchanged)
async function isServerAlive(url, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url, { timeout: 500 });
      return true;
    } catch (error) {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Function to start the MCR server (largely unchanged)
function startMcrServer(programOpts) {
  return new Promise((resolve, reject) => {
    // Pre-TUI logging is okay here
    if (!programOpts.json) { // programOpts.json might be deprecated for chat TUI
      console.log('Starting MCR server...');
    }
    const mcrScriptPath = path.resolve(__dirname, '../../../mcr.js');
    const server = spawn('node', [mcrScriptPath], {
      detached: true,
      stdio: 'ignore',
    });
    serverProcess = server; // Assign to module-level variable

    server.on('error', (err) => {
      if (!programOpts.json) {
        console.error('Failed to start MCR server:', err);
      }
      reject(err);
    });

    server.unref();

    const config = ConfigManager.get();
    const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`;

    isServerAlive(healthCheckUrl, 10, 500)
      .then((alive) => {
        if (alive) {
          if (!programOpts.json) {
            console.log('MCR server started successfully.');
          }
          resolve();
        } else {
          if (!programOpts.json) {
            console.error(
              'MCR server did not become available in time. Check server logs.'
            );
          }
          reject(new Error('Server failed to start or become healthy.'));
        }
      })
      .catch(reject);
  });
}

// Main Ink Application Component
const ChatApp = ({ sessionId, initialOntologyContent, programOpts, onExitTrigger }) => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isExiting, setIsExiting] = React.useState(false);

  React.useEffect(() => {
    const initialMessages = [{ type: 'system', text: `Chat session started. Session ID: ${sessionId}. Type 'exit' or 'quit' or Ctrl+C to leave.` }];
    if (initialOntologyContent) {
      initialMessages.push({ type: 'system', text: `Using ontology provided via -o option.` });
    }
    setMessages(initialMessages);
  }, [sessionId, initialOntologyContent]);

  const handleInputSubmit = async (query) => {
    if (!query.trim() || isExiting) return;

    // FUTURE ENHANCEMENT: Parse `query` for special commands (e.g., /show_facts, /run_example)
    // before treating it as a chat message. This could involve a more sophisticated
    // command parsing mechanism.
    if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
      setIsExiting(true);
      setMessages(prev => [...prev, { type: 'system', text: 'Exiting chat...' }]);
      await onExitTrigger();
      exit();
      return;
    }

    setMessages(prev => [...prev, { type: 'user', text: query }]);
    setInputValue('');

    try {
      const requestBody = {
        query: query,
        options: { style: 'conversational' },
      };
      if (initialOntologyContent) {
        requestBody.ontology = initialOntologyContent;
      }

      const response = await axios.post(
        `${API_BASE_URL}/sessions/${sessionId}/query`,
        requestBody
      );

      const mcrResponse = response.data?.answer || JSON.stringify(response.data);
      setMessages(prev => [...prev, { type: 'mcr', text: mcrResponse }]);

    } catch (error) {
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'An API error occurred';
      setMessages(prev => [...prev, { type: 'system', text: `Error: ${errorMessage}` }]);
      // originalHandleApiError(error, programOpts); // This logs to console, might be too noisy for TUI
    }
  };

  useInput(async (input, key) => {
    if (isExiting) return;
    // FUTURE ENHANCEMENT: More complex keybindings for command palette (e.g., Ctrl+P)
    // or other TUI actions could be handled here.
    if (key.ctrl && key.c) {
      setIsExiting(true);
      setMessages(prev => [...prev, { type: 'system', text: 'Ctrl+C detected. Exiting...' }]);
      await onExitTrigger();
      exit();
      return;
    }
  });

  return (
    // Main layout container.
    // FUTURE ENHANCEMENT: Could change flexDirection to "row" to add a sidebar (e.g. a new <Box width="30%">)
    // for displaying context, facts, or ontology details. The current chat (Output + Input)
    // would then be in a <Box flexGrow={1}> next to it.
    <Box flexDirection="column" width="100%" height="100%">
      {/* Output Area */}
      {/* FUTURE ENHANCEMENT: For features like a command palette, a new component
          could be conditionally rendered here, possibly overlaying parts of the UI,
          managed by a state variable toggled by a keybinding in useInput. */}
      <Box flexGrow={1} flexDirection="column" overflowY="auto" padding={1}>
        {messages.map((msg, index) => (
          <Box key={index} marginBottom={1}>
            <Text color={msg.type === 'user' ? 'greenBright' : msg.type === 'mcr' ? 'blueBright' : msg.type === 'system' ? 'yellowBright' : 'white'}>
              {msg.type === 'user' ? 'You: ' : msg.type === 'mcr' ? 'MCR: ' : 'System: '}
            </Text>
            {/* FUTURE ENHANCEMENT: Replace <Text>{msg.text}</Text> with a <MessageContent text={msg.text} type={msg.type} />
                component. This new component could handle:
                - Syntax highlighting for Prolog code if msg.type is 'mcr' and content indicates code.
                - Markdown rendering or other rich text formatting if desired.
                - It would involve parsing msg.text and rendering different Ink components accordingly.
            */}
            <Text>{msg.text}</Text>
          </Box>
        ))}
      </Box>
      {!isExiting && (
        // Input Area
        // FUTURE ENHANCEMENT: A status bar or menu (e.g. using <Static> from Ink)
        // could be added below or above this input box to show common commands or status.
        <Box borderStyle="round" paddingX={1} borderColor="cyan">
          <Box marginRight={1}><Text color="cyan">You> </Text></Box>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleInputSubmit}
            placeholder="Type your message..."
          />
        </Box>
      )}
    </Box>
  );
};

async function startChatAsync(options, command) {
  const programOpts = command.parent.opts(); // General CLI options (like --json)
  let sessionId = null;
  let ontologyContent = null;
  // serverStartedByChat is a module-level global

  if (programOpts.json) {
    console.log(JSON.stringify({error: "TUI_MODE_NO_JSON", message: "The TUI chat mode does not support JSON output for the interactive session itself. Server logs and other parts may still use JSON if configured."}));
    // For now, TUI mode will not render if --json is passed, to avoid confusion.
    // A future enhancement could be a separate non-TUI chat handler if --json is present.
    process.exit(1);
  }


  if (options.ontology) {
    ontologyContent = readOntologyFile(options.ontology);
  }

  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl;

  try {
    if (!(await isServerAlive(healthCheckUrl, 1, 100))) {
      if (!programOpts.json) console.log('MCR server not detected. Attempting to start it...');
      try {
        await startMcrServer(programOpts);
        serverStartedByChat = true;
        if (!programOpts.json) console.log('MCR server is starting up...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (serverStartError) {
        console.error(`Critical: Failed to start MCR server: ${serverStartError.message}. Please start it manually and try again.`);
        process.exit(1);
      }
    } else {
      if (!programOpts.json) console.log('Existing MCR server detected.');
    }

    if (!programOpts.json) console.log('Initializing chat session...');
    const sessionResponse = await apiClient.post('/sessions');
    sessionId = sessionResponse.data.sessionId;

    const performCleanup = async () => {
      if (sessionId) {
        if (!programOpts.json) console.log(`Terminating session ${sessionId}...`);
        try {
          await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
          if (!programOpts.json) console.log(`Session ${sessionId} terminated.`);
        } catch (error) {
          if (!programOpts.json) console.error(`Failed to terminate session ${sessionId}: ${error.message}`);
          else originalHandleApiError(error, programOpts);
        }
      }
      if (serverProcess && serverStartedByChat) {
        if (!programOpts.json) console.log('Stopping MCR server started by this chat session...');
        try {
          if (serverProcess.pid) {
            process.kill(serverProcess.pid, 'SIGTERM');
            if (!programOpts.json) console.log('Server stop signal sent.');
          }
        } catch (e) {
          if (!programOpts.json) console.warn(`Could not send kill signal to server process (PID: ${serverProcess.pid}). It might require manual termination. Error: ${e.message}`);
          else console.error(JSON.stringify({error: "server_stop_failed", message: e.message, pid: serverProcess.pid}));
        }
        serverProcess = null;
      }
    };

    // Ink will take over the screen. Pre-Ink console logs are fine.
    const app = render(
      <ChatApp
        sessionId={sessionId}
        initialOntologyContent={ontologyContent}
        programOpts={programOpts}
        onExitTrigger={performCleanup}
      />,
      { exitOnCtrlC: false }
    );

    await app.waitUntilExit();

  } catch (error) {
    console.error(`\nCritical error during chat initialization or TUI setup: ${error.message}`);
    if (error.code === 'ECONNREFUSED' && !serverStartedByChat) {
        console.error("This might be because the MCR server is not running and could not be started automatically.");
    }

    if (serverProcess && serverStartedByChat) {
        console.log('Attempting to stop MCR server due to critical error...');
        try {
            if (serverProcess.pid) process.kill(serverProcess.pid, 'SIGTERM');
        } catch (e) {
            console.warn("Could not send kill signal to server process during error exit.", e.message);
        }
        serverProcess = null;
    }
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start an interactive TUI chat session with the MCR. Starts the server if not running.')
    .option(
      '-o, --ontology <file>',
      'Specify an ontology file to use for the entire chat session'
    )
    .action(startChatAsync);
};
