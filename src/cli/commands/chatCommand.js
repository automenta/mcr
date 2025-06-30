/* eslint-disable no-console */
const api = require('../api'); // Import all exported functions from api.js
const { readOntologyFile, readFileContentSafe, delay } = require('../utils');
const axios = require('axios'); // Still needed for isServerAlive check directly
const { spawn } = require('child_process');
const path = require('path');
const ConfigManager = require('../../config');

// Ink and React will be required dynamically inside startAppAsync
let React;
let render, Box, Text, Newline, useApp, useInput, Static, Spacer;
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


// Helper to parse simple command line options like --option value
// For TUI internal commands, not a full CLI parser.
/**
 * Parses simple command line arguments (like --option value) for TUI internal commands.
 * This is not a full CLI parser.
 * @param {string[]} args - Array of argument strings.
 * @returns {{options: object, _: string[]}} Parsed options and remaining arguments.
 */
function parseTuiCommandArgs(args) {
  const options = {};
  const remainingArgs = [];
  let currentOption = null;

  for (const arg of args) {
    if (arg.startsWith('--')) {
      currentOption = arg.substring(2);
      options[currentOption] = true; // Default to true if it's a flag
    } else if (currentOption) {
      options[currentOption] = arg;
      currentOption = null;
    } else {
      remainingArgs.push(arg);
    }
  }
  return { options, _: remainingArgs };
}


let serverProcess = null;
let serverStartedByChat = false; // Tracks if this TUI instance started the server

/**
 * Checks if the MCR server is alive by making a GET request to its root.
 * @param {string} url - The base URL of the MCR server.
 * @param {number} [retries=5] - Number of times to retry.
 * @param {number} [delayTime=1000] - Time in ms to wait between retries.
 * @returns {Promise<boolean>} True if server is alive, false otherwise.
 */
async function isServerAlive(url, retries = 5, delayTime = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url, { timeout: 500 }); // Using axios directly for a simple health check
      return true;
    } catch (error) {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayTime));
      }
    }
  }
  return false;
}

/**
 * Starts the MCR server as a detached background process.
 * @param {object} programOpts - Commander program options (used for conditional logging).
 * @returns {Promise<void>} Resolves when server is started and detected as healthy, or rejects on error.
 */
function startMcrServer(programOpts) {
  return new Promise((resolve, reject) => {
    // Pre-TUI logging is okay here as Ink hasn't taken over the console yet.
    if (!programOpts.json) {
      // This console.log will be overwritten by Ink, but useful for pre-TUI debug
      console.log('Starting MCR server...');
    }
    const mcrScriptPath = path.resolve(__dirname, '../../../mcr.js');
    const server = spawn('node', [mcrScriptPath], {
      detached: true,
      stdio: 'ignore', // Change to 'pipe' if we want to capture server logs in TUI
    });
    serverProcess = server;

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
          resolve();
        } else {
          reject(new Error('Server failed to start or become healthy.'));
        }
      })
      .catch(reject);
  });
}

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
const McrApp = ({ initialSessionId, initialOntologyContent: initialOntologyPath, programOpts, onExitTrigger }) => {
  const { exit } = useApp();
  const [messages, setMessages] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');
  const [isExiting, setIsExiting] = React.useState(false);
  const [currentSessionId, setCurrentSessionId] = React.useState(initialSessionId);
  const [serverStatus, setServerStatus] = React.useState('Checking...');
  const [currentOntologyDisplay, setCurrentOntologyDisplay] = React.useState(initialOntologyPath ? path.basename(initialOntologyPath) : 'None');
  const [isDemoRunning, setIsDemoRunning] = React.useState(false);
  const [chatDebugMode, setChatDebugMode] = React.useState(false);


  React.useEffect(() => {
    const welcomeMessages = [
      { type: 'system', text: 'Welcome to MCR. Type /help for a list of commands.' },
    ];
    if (currentSessionId) {
      welcomeMessages.push({ type: 'system', text: `Active session: ${currentSessionId}.` });
    } else {
      welcomeMessages.push({ type: 'system', text: 'No active session. Use /create-session or chat to start one.' });
    }
    if (initialOntologyPath) {
      welcomeMessages.push({ type: 'system', text: `Startup ontology context: ${path.basename(initialOntologyPath)} (used for NL to Rules context if applicable).` });
    }
    setMessages(welcomeMessages);
    checkServerStatus();
  }, [initialSessionId, initialOntologyPath]);

  /**
   * Adds a message to the TUI output.
   * @param {string} type - Type of message (e.g., 'system', 'user', 'mcr', 'error', 'output').
   * @param {string|object} text - The message content. Objects will be stringified.
   */
  const addMessage = (type, text) => {
    const messageText = (typeof text === 'object' && text !== null) ? JSON.stringify(text, null, 2) : text;
    setMessages(prev => [...prev, { type, text: messageText }]);
  };

  /**
   * Checks the MCR server status and updates the TUI.
   * @returns {Promise<object|null>} Server status data or null on failure.
   */
  const checkServerStatus = async () => {
    try {
      const statusData = await tuiGetServerStatus(); // Use the new helper
      setServerStatus(`OK (v${statusData?.version})`);
      return statusData;
    } catch (error) {
      setServerStatus('Unavailable');
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Unknown error';
      addMessage('error', `Server status check failed: ${errorMessage}`);
      return null;
    }
  };

  // --- Demo Implementations ---
  /** Runs the Simple Q&A demo, interacting with the MCR API. */
  const runSimpleQADemo = async () => {
    setIsDemoRunning(true);
    addMessage('system', '🚀 Starting Simple Q&A Demo...');
    await delay(500);
    let demoSessionId;
    try {
      addMessage('system', '1. Creating a new session...');
      const sessionResponse = await agentApiCreateSession(); // Using direct API call
      demoSessionId = sessionResponse.sessionId;
      addMessage('output', { action: 'Create Session', response: sessionResponse });
      if (!demoSessionId) throw new Error('Failed to create session for demo.');

      addMessage('system', `2. Asserting facts into session ${demoSessionId}...`);
      const factsToAssert = 'The sky is blue. Grass is green.';
      addMessage('output', `   - "${factsToAssert}"`);
      const assertResponse = await agentApiAssertFacts(demoSessionId, factsToAssert);
      addMessage('output', { action: 'Assert Facts', request: { factsToAssert }, response: assertResponse });

      addMessage('system', `3. Querying session ${demoSessionId}...`);
      let question = 'What color is the sky?';
      addMessage('output', `   ❓ Question: "${question}"`);
      let queryResponse = await agentApiQuery(demoSessionId, question);
      addMessage('output', { action: 'Query', request: { question }, response: queryResponse });

      question = 'What color is the grass?';
      addMessage('output', `   ❓ Question: "${question}"`);
      queryResponse = await agentApiQuery(demoSessionId, question);
      addMessage('output', { action: 'Query', request: { question }, response: queryResponse });

    } catch (error) {
      addMessage('error', `Error during Simple Q&A Demo: ${error.message}`);
      if (error.response?.data) addMessage('output', { serverError: error.response.data });
    } finally {
      if (demoSessionId) {
        addMessage('system', `4. Cleaning up: Deleting demo session ${demoSessionId}...`);
        try {
          const deleteResponse = await agentApiDeleteSession(demoSessionId);
          addMessage('output', { action: 'Delete Session', response: deleteResponse });
        } catch (cleanupError) {
          addMessage('error', `Failed to delete demo session ${demoSessionId}: ${cleanupError.message}`);
        }
      }
      addMessage('system', '🏁 Simple Q&A Demo Finished.');
      setIsDemoRunning(false);
    }
  };

  /** Runs the Family Ontology demo, showcasing ontology management and querying. */
  const runFamilyOntologyDemo = async () => {
    setIsDemoRunning(true);
    addMessage('system', '🚀 Starting Family Ontology Demo...');
    await delay(500);
    let demoSessionId;
    const ontologyName = 'tui_family_demo';
    // Assuming family.pl is in ontologies/ relative to project root
    const ontologyFilePath = 'ontologies/family.pl';

    try {
      addMessage('system', `1. Adding '${ontologyName}' ontology from '${ontologyFilePath}'...`);
      try { // Pre-cleanup
        await agentApiDeleteOntology(ontologyName, true);
      } catch {/* ignore */}
      const rules = readFileContentSafe(ontologyFilePath, addMessage, 'Family ontology file');
      if (!rules) throw new Error(`Failed to read ${ontologyFilePath} for demo.`);
      const ontologyResponse = await agentApiAddOntology(ontologyName, rules); // Pass content
      addMessage('output', { action: 'Add Ontology', request: { ontologyName, filePath: ontologyFilePath }, response: ontologyResponse });

      addMessage('system', '2. Creating a new session with default ontology...');
      // The createSession API endpoint doesn't take default ontology name directly in current documented API.
      // For this demo, we'll assume it's implicitly used or handle it if API changes.
      // Or, explicitly load it into session if API supports that.
      // For now, we'll just create a session. The ontology is global.
      const sessionResponse = await agentApiCreateSession();
      demoSessionId = sessionResponse.sessionId;
      addMessage('output', { action: 'Create Session', response: sessionResponse });
      if (!demoSessionId) throw new Error('Failed to create session for demo.');

      addMessage('system', `3. Asserting family facts into session ${demoSessionId}...`);
      const factsToAssert = 'father(john, mary). mother(jane, mary). father(peter, john).';
      addMessage('output', `   - "${factsToAssert}"`);
      const assertResponse = await agentApiAssertFacts(demoSessionId, factsToAssert);
      addMessage('output', { action: 'Assert Facts', request: { factsToAssert }, response: assertResponse });

      addMessage('system', `4. Querying session ${demoSessionId} using family ontology...`);
      let question = "Who is marys father?";
      addMessage('output', `   ❓ Question: "${question}"`);
      let queryResponse = await agentApiQuery(demoSessionId, question);
      addMessage('output', { action: 'Query', request: { question }, response: queryResponse });

      question = "Who is marys grandfather?";
      addMessage('output', `   ❓ Question: "${question}"`);
      queryResponse = await agentApiQuery(demoSessionId, question);
      addMessage('output', { action: 'Query', request: { question }, response: queryResponse });

    } catch (error) {
      addMessage('error', `Error during Family Ontology Demo: ${error.message}`);
      if (error.response?.data) addMessage('output', { serverError: error.response.data });
    } finally {
      if (demoSessionId) {
        addMessage('system', `5. Cleaning up: Deleting demo session ${demoSessionId}...`);
        try {
          await agentApiDeleteSession(demoSessionId);
        } catch (e) { addMessage('error', `Failed to delete demo session: ${e.message}`);}
      }
      addMessage('system', `6. Cleaning up: Deleting ontology '${ontologyName}'...`);
      try {
        await agentApiDeleteOntology(ontologyName, true);
      } catch (e) { addMessage('error', `Failed to delete demo ontology: ${e.message}`);}

      addMessage('system', '🏁 Family Ontology Demo Finished.');
      setIsDemoRunning(false);
    }
  };
  // --- End Demo Implementations ---

  /**
   * Handles slash commands entered by the user.
   * @param {string} command - The command name (without the slash).
   * @param {string[]} args - Arguments provided with the command.
   */
  const handleCommand = async (command, args) => {
    if (isDemoRunning) {
      addMessage('error', 'A demo is currently running. Please wait for it to complete.');
      return;
    }
    addMessage('command', `Executing: /${command} ${args.join(' ')}`);
    setInputValue('');
    let targetSessionId;
    let ontologyName, filePath, rulesContent, response;
    let text, templateName, inputVariablesJson, parsedArgs, options;


    try {
      switch (command) {
        case 'help':
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
          break;
        case 'status':
          const statusData = await checkServerStatus();
          if (statusData) {
            addMessage('system', `Server Status: ${serverStatus}`);
            addMessage('output', `Name: ${statusData.name}`);
            addMessage('output', `Version: ${statusData.version}`);
            addMessage('output', `Description: ${statusData.description}`);
          }
          break;
        case 'create-session':
          response = await api.createSession();
          setCurrentSessionId(response.sessionId);
          addMessage('system', `New session created: ${response.sessionId}`);
          addMessage('output', response);
          break;
        case 'get-session':
          targetSessionId = args[0] || currentSessionId;
          if (!targetSessionId) {
            addMessage('error', 'No session ID specified and no active session.');
            break;
          }
          response = await api.getSession(targetSessionId);
          addMessage('system', `Details for session ${targetSessionId}:`);
          addMessage('output', response);
          break;
        case 'delete-session':
          targetSessionId = args[0] || currentSessionId;
          if (!targetSessionId) {
            addMessage('error', 'No session ID specified and no active session.');
            break;
          }
          response = await api.deleteSession(targetSessionId);
          addMessage('system', response.message || `Session ${targetSessionId} deleted.`);
          if (targetSessionId === currentSessionId) {
            setCurrentSessionId(null);
            addMessage('system', 'Active session cleared.');
          }
          break;
        case 'assert':
          targetSessionId = currentSessionId;
          const assertText = args.join(' ');
          if (!targetSessionId) {
            addMessage('error', 'No active session to assert to. Use /create-session or chat first.');
            break;
          }
          if (!assertText) {
            addMessage('error', 'Usage: /assert <text to assert>');
            break;
          }
          response = await api.assertFacts(targetSessionId, assertText);
          addMessage('system', `Facts asserted to session ${targetSessionId}:`);
          addMessage('output', response);
          break;
        case 'query':
          targetSessionId = currentSessionId;
          const question = args.join(' ');
          if (!targetSessionId) {
            addMessage('error', 'No active session to query. Use /create-session or chat first.');
            break;
          }
          if (!question) {
            addMessage('error', 'Usage: /query <question>');
            break;
          }
          let queryOntologyContent = null;
          if (initialOntologyPath) {
             queryOntologyContent = readFileContentSafe(initialOntologyPath, addMessage, "Startup ontology for query");
             // If readFileContentSafe returns null (error reading), it would have already added an error message.
          }
          // Only proceed if ontology loading didn't fail critically (readFileContentSafe handles message)
          // or if no initialOntologyPath was specified.
          if (initialOntologyPath && !queryOntologyContent) break;

          response = await api.query(targetSessionId, question, { style: 'conversational', debug: chatDebugMode }, queryOntologyContent);
          addMessage('system', `Query to session ${targetSessionId}: "${question}"`);
          addMessage('mcr', response.answer || JSON.stringify(response));
          if (response.debug) addMessage('output', {debugInfo: response.debug});
          if (chatDebugMode && response.translation) addMessage('output', {translation: response.translation});
          if (chatDebugMode && response.prologOutput) addMessage('output', {prolog: response.prologOutput});
          break;
        case 'explain':
          targetSessionId = currentSessionId;
          const explainQuestion = args.join(' ');
          if (!targetSessionId) {
            addMessage('error', 'No active session for explanation. Use /create-session or chat first.');
            break;
          }
          if (!explainQuestion) {
            addMessage('error', 'Usage: /explain <question>');
            break;
          }
          response = await api.explainQuery(targetSessionId, explainQuestion);
          addMessage('system', `Explanation for query in session ${targetSessionId}: "${explainQuestion}"`);
          addMessage('output', response);
          break;
        // Ontology Commands
        case 'list-ontologies':
          response = await api.listOntologies();
          addMessage('system', 'Available Ontologies:');
          if (response.length === 0) {
            addMessage('output', 'No ontologies found.');
          } else {
            response.forEach(ont => addMessage('output', `- ${ont.name} (${ont.rules ? ont.rules.split('\n').length : 0} rules)`));
          }
          break;
        case 'get-ontology':
          ontologyName = args[0];
          if (!ontologyName) {
            addMessage('error', 'Usage: /get-ontology <name>');
            break;
          }
          response = await api.getOntology(ontologyName);
          addMessage('system', `Details for ontology "${ontologyName}":`);
          addMessage('output', response);
          break;
        case 'add-ontology':
          [ontologyName, filePath] = args;
          if (!ontologyName || !filePath) {
            addMessage('error', 'Usage: /add-ontology <name> <filePath>');
            break;
          }
          rulesContent = readFileContentSafe(filePath, addMessage);
          if (!rulesContent) break;
          response = await api.addOntology(ontologyName, rulesContent);
          addMessage('system', `Ontology "${ontologyName}" added:`);
          addMessage('output', response);
          break;
        case 'update-ontology':
          [ontologyName, filePath] = args;
          if (!ontologyName || !filePath) {
            addMessage('error', 'Usage: /update-ontology <name> <filePath>');
            break;
          }
          rulesContent = readFileContentSafe(filePath, addMessage);
          if (!rulesContent) break;
          response = await api.updateOntology(ontologyName, rulesContent);
          addMessage('system', `Ontology "${ontologyName}" updated:`);
          addMessage('output', response);
          break;
        case 'delete-ontology':
          ontologyName = args[0];
          if (!ontologyName) {
            addMessage('error', 'Usage: /delete-ontology <name>');
            break;
          }
          response = await api.deleteOntology(ontologyName);
          addMessage('system', response.message || `Ontology "${ontologyName}" deleted.`);
          break;
        // Translation Commands
        case 'nl2rules':
          parsedArgs = parseTuiCommandArgs(args);
          text = parsedArgs._.join(' ');
          if (!text) {
            addMessage('error', 'Usage: /nl2rules <text> [--facts "..."] [--ontology path/file.pl]');
            break;
          }
          let nlFacts = null, nlOntologyContext = null;
          if (parsedArgs.options.facts) {
            nlFacts = parsedArgs.options.facts;
          }
          if (parsedArgs.options.ontology) {
            nlOntologyContext = readFileContentSafe(parsedArgs.options.ontology, addMessage, 'Ontology context file');
            if (!nlOntologyContext) break;
          }
          response = await api.nlToRules(text, nlFacts, nlOntologyContext);
          addMessage('system', 'Translated NL to Rules:');
          addMessage('output', response);
          break;
        case 'rules2nl':
          parsedArgs = parseTuiCommandArgs(args);
          filePath = parsedArgs._[0];
          if (!filePath) {
            addMessage('error', 'Usage: /rules2nl <filePath> [--style formal|conversational]');
            break;
          }
          rulesContent = readFileContentSafe(filePath, addMessage, 'Rules file');
          if (!rulesContent) break;
          // api.rulesToNl helper now handles splitting string to array
          const style = parsedArgs.options.style || 'formal';
          response = await api.rulesToNl(rulesContent, style);
          addMessage('system', `Translated Rules from "${filePath}" to NL (style: ${style}):`);
          addMessage('output', response);
          break;
        // Prompt Commands
        case 'list-prompts':
          response = await api.listPrompts();
          addMessage('system', 'Available prompt templates:');
          if (Object.keys(response).length === 0) {
            addMessage('output', 'No prompt templates found.');
          } else {
            Object.keys(response).forEach(name => addMessage('output', `- ${name}`));
          }
          break;
        case 'show-prompt':
          templateName = args[0];
          if (!templateName) {
            addMessage('error', 'Usage: /show-prompt <templateName>');
            break;
          }
          // listPrompts returns all prompts, so we can use it and then select.
          const allPrompts = await api.listPrompts();
          if (!allPrompts[templateName]) {
            addMessage('error', `Prompt template '${templateName}' not found.`);
            break;
          }
          addMessage('system', `Content of prompt template '${templateName}':`);
          addMessage('output', allPrompts[templateName]);
          break;
        case 'debug-prompt':
          templateName = args[0];
          inputVariablesJson = args.slice(1).join(' ');
          if (!templateName || !inputVariablesJson) {
            addMessage('error', 'Usage: /debug-prompt <templateName> <inputVariablesJsonString>');
            break;
          }
          let inputVars;
          try {
            inputVars = JSON.parse(inputVariablesJson);
          } catch (e) {
            addMessage('error', `Invalid JSON for input variables: ${e.message}`);
            break;
          }
          response = await api.debugFormatPrompt(templateName, inputVars);
          addMessage('system', `Debugging prompt template '${response.templateName}':`);
          addMessage('output', `Raw Template: ${response.rawTemplate}`);
          addMessage('output', `Input Variables: ${JSON.stringify(response.inputVariables, null, 2)}`);
          addMessage('output', `Formatted Prompt: ${response.formattedPrompt}`);
          break;
        // Demo Commands
        case 'run-demo':
          const demoName = args[0];
          if (demoName === 'simpleQA' || demoName === 'simpleqa') {
            await runSimpleQADemo();
          } else if (demoName === 'family' || demoName === 'familyOntology' || demoName === 'familyontology') {
            await runFamilyOntologyDemo();
          } else {
            addMessage('error', `Unknown demo: ${demoName}. Available: simpleQA, family`);
          }
          break;
        case 'toggle-debug-chat':
            setChatDebugMode(!chatDebugMode);
            addMessage('system', `Chat debug mode ${!chatDebugMode ? 'enabled' : 'disabled'}. Query responses will now ${!chatDebugMode ? 'include more' : 'not include extra'} details.`);
            break;
        case 'exit':
        case 'quit':
          setIsExiting(true);
          addMessage('system', 'Exiting application...');
          await onExitTrigger(currentSessionId);
          exit();
          return;
        default:
          addMessage('error', `Unknown command: /${command}`);
      }
    } catch (error) {
      const errorSource = error.isAxiosError ? 'API Error' : 'Command Error';
      const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || 'An unexpected error occurred';
      addMessage('error', `${errorSource} for /${command}: ${errorMessage}`);
      if (error.response?.data && typeof error.response.data === 'object') {
        const detailText = JSON.stringify(error.response.data, null, 2);
        if (detailText !== errorMessage) {
            setMessages(prev => [...prev, { type: 'output', text: detailText }]);
        }
      } else if (error.response?.data && typeof error.response.data === 'string' && error.response.data !== errorMessage) {
        setMessages(prev => [...prev, { type: 'output', text: error.response.data }]);
      }
    }
  };

  /**
   * Handles regular chat messages (non-commands).
   * Creates a session if one isn't active, then submits the message.
   * @param {string} queryString - The chat message from the user.
   */
  const handleChatMessage = async (queryString) => {
    if (isDemoRunning) {
      addMessage('error', 'A demo is currently running. Please wait for it to complete before sending chat messages.');
      setInputValue(queryString); // Keep query in input
      return;
    }
    if (!currentSessionId) {
      try {
        addMessage('system', 'No active session. Creating one for chat...');
        const sessionData = await api.createSession(); // Use helper
        setCurrentSessionId(sessionData.sessionId);
        addMessage('system', `New session for chat: ${sessionData.sessionId}`);
        await submitMessageToSession(queryString, sessionData.sessionId);
      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Failed to create session for chat.';
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
  const submitMessageToSession = async (queryString, sessionIdForQuery) => {
     addMessage('user', queryString);
     setInputValue('');
    try {
      let dynamicOntologyContent = null;
      if (initialOntologyPath) {
        dynamicOntologyContent = readFileContentSafe(initialOntologyPath, addMessage, "Startup ontology context for chat");
        // If readFileContentSafe returns null (error reading), it would have already added an error message.
        // We'll proceed with query, it just won't have the dynamic ontology.
      }

      const response = await api.query(
        sessionIdForQuery,
        queryString,
        { style: 'conversational', debug: chatDebugMode },
        dynamicOntologyContent
      );

      const mcrResponse = response.answer || JSON.stringify(response);
      addMessage('mcr', mcrResponse);
      if (chatDebugMode && response.debug) addMessage('output', {debugInfo: response.debug});
      if (chatDebugMode && response.translation) addMessage('output', {translation: response.translation});
      if (chatDebugMode && response.prologOutput) addMessage('output', {prolog: response.prologOutput});

    } catch (error) {
      const errorMessage = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'An API error occurred during chat';
      addMessage('error', `Chat Error: ${errorMessage}`);
    }
  }

  /**
   * Handles submission of the text input field.
   * Differentiates between commands (starting with '/') and chat messages.
   * @param {string} input - The text from the input field.
   */
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
      return;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%" borderStyle="round" borderColor="blue">
      {/* Status Bar */}
      <Box paddingX={1} borderStyle="single" borderBottom borderColor="gray">
        <Text color="cyan">MCR TUI</Text>
        <Spacer />
        <Text>Session: {currentSessionId || 'None'}</Text>
        <Spacer />
        <Text>Ontology: {currentOntologyDisplay}</Text>
        <Spacer />
        <Text>Server: {serverStatus}</Text>
        <Spacer />
        <Text>ChatDebug: {chatDebugMode ? 'ON' : 'OFF'}</Text>
      </Box>

      {/* Main Content Area (Messages/Outputs) */}
      <Box flexGrow={1} flexDirection="column" overflowY="auto" padding={1}>
        {messages.map((msg, index) => (
          <Box key={index} marginBottom={msg.type === 'output' || msg.type === 'error' ? 0 : 1}>
            <Text
              color={
                msg.type === 'user' ? 'greenBright' :
                msg.type === 'mcr' ? 'blueBright' :
                msg.type === 'system' ? 'yellowBright' :
                msg.type === 'command' ? 'magentaBright' :
                msg.type === 'error' ? 'redBright' :
                'white'
              }
            >
              {msg.type === 'user' ? 'You: ' :
               msg.type === 'mcr' ? 'MCR: ' :
               msg.type === 'system' ? 'System: ' :
               msg.type === 'command' ? 'Cmd: ' :
               msg.type === 'error' ? 'Error: ' :
               msg.type === 'output' ? '  ' :
               ''}
              {msg.text}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Input Bar */}
      {!isExiting && (
        <Box borderStyle="round" paddingX={1} borderColor="cyan" borderTop>
          <Box marginRight={1}><Text color="cyan">{(isDemoRunning ? 'DEMO RUNNING >' : '>')}</Text></Box>
          <TextInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            placeholder={(isDemoRunning ? "Wait for demo to finish..." : "Type a message or /command (e.g. /help)...")}
            isReadOnly={isDemoRunning} // Make input read-only during demo
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
  Newline = inkModule.Newline;
  useApp = inkModule.useApp;
  useInput = inkModule.useInput;
  Static = inkModule.Static;
  Spacer = inkModule.Spacer;
  TextInput = (await Function('return import("ink-text-input")')()).default;

  // Check for TTY, essential for Ink's raw mode and interactive input
  if (!process.stdin.isTTY) {
    console.error("ERROR: MCR Chat TUI requires an interactive terminal (TTY).");
    console.error("Raw mode for input is not supported in the current environment.");
    console.error("Please run this command in a fully interactive terminal session.");
    process.exit(1); // Exit gracefully as TUI cannot function
  }

  const programOpts = command.parent.opts();
  let initialSessionId = null;
  let initialOntologyPath = null; // Store path from -o option

  if (programOpts.json) {
    console.log(JSON.stringify({error: "TUI_MODE_NO_JSON", message: "The TUI mode does not support JSON output."}));
    process.exit(1);
  }

  if (options.ontology) {
    initialOntologyPath = options.ontology; // Store path for McrApp to use/display
  }

  const config = ConfigManager.get();
  const serverUrl = `http://${config.server.host}:${config.server.port}/`;
  const healthCheckUrl = serverUrl;
  let localServerProcess = null;
  let localServerStartedByChat = false;

  try {
    let serverJustStarted = false;
    if (!(await isServerAlive(healthCheckUrl, 1, 100))) {
      console.log('MCR server not detected. Attempting to start it...');
      try {
        await startMcrServer(programOpts);
        localServerProcess = serverProcess;
        localServerStartedByChat = true;
        serverStartedByChat = true;
        console.log('MCR server is starting up... waiting a moment.');
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (!(await isServerAlive(healthCheckUrl, 3, 500))) {
            throw new Error("Server was started but did not become healthy in time.");
        }
        serverJustStarted = true;
      } catch (serverStartError) {
        console.error(`Critical: Failed to start MCR server: ${serverStartError.message}. Please start it manually and try again.`);
        process.exit(1);
      }
    } else {
      // console.log('Existing MCR server detected.');
    }


    const performCleanup = async (activeSessionId) => {
      if (activeSessionId) {
        console.log(`Terminating session ${activeSessionId}...`);
        try {
          await api.deleteSession(activeSessionId); // Use helper
          console.log(`Session ${activeSessionId} terminated.`);
        } catch (error) {
          // Log error but don't exit, as other cleanup might need to run
          const errorMsg = error.response?.data?.error?.message || error.response?.data?.message || error.message || 'Unknown error during session termination';
          console.error(`Failed to terminate session ${activeSessionId}: ${errorMsg}`);
        }
      }
      if (localServerProcess && localServerStartedByChat) {
        console.log('Stopping MCR server started by this TUI session...');
        try {
          if (localServerProcess.pid) {
            process.kill(localServerProcess.pid, 'SIGTERM');
            console.log('Server stop signal sent.');
          }
        } catch (e) {
          console.warn(`Could not send kill signal to server process (PID: ${localServerProcess.pid}). It might require manual termination. Error: ${e.message}`);
        }
      }
    };

    if (localServerProcess) serverProcess = localServerProcess;
    if (localServerStartedByChat) serverStartedByChat = localServerStartedByChat;


    const app = render(
      <McrApp
        initialSessionId={initialSessionId}
        initialOntologyContent={initialOntologyPath} // Pass the path for display and use in McrApp
        programOpts={programOpts}
        onExitTrigger={performCleanup}
      />,
      { exitOnCtrlC: false }
    );

    await app.waitUntilExit();

  } catch (error) {
    console.error(`\nCritical error during TUI initialization or operation: ${error.message}`);
    if (error.code === 'ECONNREFUSED' && !localServerStartedByChat && !serverStartedByChat) {
        console.error("This might be because the MCR server is not running and could not be started automatically.");
    }
    if (localServerProcess && localServerStartedByChat) {
        console.log('Attempting to stop MCR server due to critical error...');
        try {
            if (localServerProcess.pid) process.kill(localServerProcess.pid, 'SIGTERM');
        } catch (e) {
            console.warn("Could not send kill signal to server process during error exit.", e.message);
        }
    }
    process.exit(1);
  }
}

module.exports = (program) => {
  program
    .command('chat')
    .description('Start the interactive MCR TUI. Starts the server if not running.')
    .option(
      '-o, --ontology <file>',
      'Specify an ontology file to load at startup (its name will be shown in status)'
    )
    .action(startAppAsync);
};
