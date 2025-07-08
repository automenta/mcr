// new/chat.js
const axios = require('axios');
const inquirer = require('inquirer');
const config = require('./src/config'); // To get server URL
const logger = require('./src/util/logger'); // Using the same logger for consistency
const winston = require('winston'); // Import winston for format utilities
const { checkAndStartServer } = require('./src/util/cliUtils');

const API_BASE_URL = `http://${config.server.host}:${config.server.port}/api/v1`;
let currentSessionId = null;

// Configure logger for chat tool - might want a simpler console output for CLI
logger.transports.forEach((t) => {
  // Accessing transport.name is not standard for winston >= 3.x
  // A better way to identify the console transport, if needed, is instanceof
  // For now, let's assume there's only one console transport or apply to all
  if (t instanceof winston.transports.Console) {
    t.format = winston.format.combine(
      // Use winston.format directly
      winston.format.colorize(),
      winston.format.printf((info) => `${info.level}: ${info.message}`)
    );
  }
});
logger.level = 'warn'; // Default to warn for CLI, can be changed with /debug

async function createSession() {
  try {
    const response = await axios.post(`${API_BASE_URL}/sessions`);
    currentSessionId = response.data.id;
    logger.info(`Session created: ${currentSessionId}`);
    console.log(`\n✅ Session created: ${currentSessionId}`);
  } catch (error) {
    logger.error(
      'Error creating session:',
      error.response ? error.response.data : error.message
    );
    console.error(
      '\n❌ Error creating session:',
      error.response && error.response.data && error.response.data.error
        ? `${error.response.data.error.message}${error.response.data.error.details ? ` (Details: ${JSON.stringify(error.response.data.error.details)})` : ''}`
        : error.message
    );
  }
}

async function assertFact(text) {
  if (!currentSessionId) {
    console.log('\n⚠️ No active session. Please create one first with /create');
    return;
  }
  if (!text || text.trim() === '') {
    console.log(
      '\n⚠️ Assert command requires text. Usage: /assert <your fact>'
    );
    return;
  }
  try {
    console.log(`\n💬 Asserting: "${text}" to session ${currentSessionId}`);
    const response = await axios.post(
      `${API_BASE_URL}/sessions/${currentSessionId}/assert`,
      { text }
    );
    logger.info('Assertion result:', response.data);
    console.log(`✅ Assertion successful: ${response.data.message}`);
    if (response.data.addedFacts && response.data.addedFacts.length > 0) {
      console.log('   Facts added to knowledge base:');
      response.data.addedFacts.forEach((fact) => console.log(`     - ${fact}`));
    }
  } catch (error) {
    logger.error(
      'Error asserting fact:',
      error.response ? error.response.data : error.message
    );
    let displayErrorMessage = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      const errData = error.response.data.error;
      displayErrorMessage = errData.message;
      if (errData.details) {
        displayErrorMessage += ` (Details: ${JSON.stringify(errData.details)})`;
      }

      // Add contextual help
      if (
        errData.message &&
        errData.message.includes('Input is not an assertable statement')
      ) {
        displayErrorMessage +=
          '\n   ➡️ Tip: The system could not understand this as a simple fact or rule. Try rephrasing, breaking it into smaller parts, or ensuring it is a declarative statement.';
      } else if (
        errData.message &&
        errData.message.includes('Invalid term structure in SIR JSON')
      ) {
        displayErrorMessage +=
          '\n   ➡️ Tip: The system struggled to structure this information. This can happen with very complex sentences. Try simplifying the statement.';
      }
    }
    console.error('\n❌ Error asserting fact:', displayErrorMessage);
  }
}

async function querySession(question) {
  if (!currentSessionId) {
    console.log('\n⚠️ No active session. Please create one first with /create');
    return;
  }
  if (!question || question.trim() === '') {
    console.log(
      '\n⚠️ Query command requires a question. Usage: /query <your question>'
    );
    return;
  }
  try {
    console.log(`\n💬 Querying session ${currentSessionId}: "${question}"`);
    const response = await axios.post(
      `${API_BASE_URL}/sessions/${currentSessionId}/query`,
      { query: question }
    );
    logger.info('Query result:', response.data);

    console.log('\n🤖 MCR Answer:');
    console.log(`   ${response.data.answer}`);

    if (logger.level === 'debug' && response.data.debugInfo) {
      console.log('\n🔍 Debug Information:');
      console.log(`   Prolog Query: ${response.data.debugInfo.prologQuery}`);
      console.log(
        `   Prolog Results: ${response.data.debugInfo.prologResultsJSON}`
      );
      // console.log(`   KB Snapshot: ${response.data.debugInfo.knowledgeBaseSnapshot}`); // Can be very verbose
    }
  } catch (error) {
    logger.error(
      'Error querying session:',
      error.response ? error.response.data : error.message
    );
    console.error(
      '\n❌ Error querying session:',
      error.response && error.response.data && error.response.data.error
        ? `${error.response.data.error.message}${error.response.data.error.details ? ` (Details: ${JSON.stringify(error.response.data.error.details)})` : ''}`
        : error.message
    );
    // The details are now part of the main error message if they exist, so the separate block below is redundant.
    // if (
    //   error.response &&
    //   error.response.data &&
    //   error.response.data.error &&
    //   error.response.data.error.details
    // ) {
    //   console.error(
    //     '   Server Details:',
    //     JSON.stringify(error.response.data.error.details, null, 2)
    //   );
    // }
  }
}

function showHelp() {
  console.log('\nAvailable commands:');
  console.log(
    '  /create                      - Create a new reasoning session.'
  );
  console.log(
    '  /assert <natural language>   - Assert a fact or rule to the current session.'
  );
  console.log(
    '  /query <natural language>    - Ask a question to the current session.'
  );
  console.log('  /session                     - Show current session ID.');
  console.log(
    '  /debug                       - Toggle debug logging for more detailed output.'
  );
  console.log('  /help                        - Show this help message.');
  console.log('  /exit                        - Exit the chat tool.');
  console.log(
    '\nSimply type your natural language assertion or query if a session is active.'
  );
  console.log(
    'If it looks like a question (ends with "?", starts with "who/what/where/when/why/is/are/do/does"), it will be treated as a /query.'
  );
  console.log('Otherwise, it will be treated as an /assert.');
}

async function mainLoop() {
  console.log('Welcome to MCR Interactive Chat!');
  console.log(`API Server: ${API_BASE_URL}`);

  const serverReady = await checkAndStartServer();
  if (!serverReady) {
    console.error(
      '❌ Failed to connect to or start the MCR server. Please check server logs and configuration.'
    );
    console.log('   You might need to start it manually: node mcr.js');
    return; // Exit if server cannot be started
  }

  console.log('Type /help for commands, or /create to start.');

  while (true) {
    const { command } = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: currentSessionId
          ? `MCR (${currentSessionId.substring(0, 8)}):`
          : 'MCR (no session):',
      },
    ]);

    const input = command.trim();
    const parts = input.split(' ');
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ');

    if (cmd.startsWith('/')) {
      switch (cmd) {
        case '/create':
          await createSession();
          break;
        case '/assert':
          await assertFact(arg);
          break;
        case '/query':
          await querySession(arg);
          break;
        case '/session':
          console.log(
            currentSessionId
              ? `\nActive session ID: ${currentSessionId}`
              : '\nNo active session.'
          );
          break;
        case '/debug':
          logger.level = logger.level === 'debug' ? 'warn' : 'debug';
          console.log(
            `\n🔧 Debug mode ${logger.level === 'debug' ? 'enabled' : 'disabled'}.`
          );
          break;
        case '/help':
          showHelp();
          break;
        case '/exit':
          console.log('\n👋 Exiting MCR Interactive Chat.');
          return;
        default:
          console.log(
            `\n❓ Unknown command: ${cmd}. Type /help for available commands.`
          );
      }
      console.log(); // Add a blank line for spacing before next prompt
    } else if (input.length > 0) {
      // Natural language input
      if (!currentSessionId) {
        console.log(
          '\n⚠️ No active session. Please use /create first, or type /help.'
        );
        continue;
      }
      // Simple heuristic: if it ends with '?' or starts with a question word, treat as query.
      if (
        input.endsWith('?') ||
        [
          'who',
          'what',
          'where',
          'when',
          'why',
          'is',
          'are',
          'do',
          'does',
          'can',
          'should',
          'would',
          'how',
        ].includes(input.toLowerCase().split(' ')[0])
      ) {
        await querySession(input);
      } else {
        await assertFact(input);
      }
      console.log(); // Add a blank line for spacing before next prompt
    }
    // No console.log() here for empty input, as it would just add unnecessary lines.
  }
}

console.log('MCR Interactive Chat Tool');
console.log('-------------------------');

mainLoop().catch((error) => {
  logger.error('Critical error in chat tool:', error);
  console.error('💥 Critical error in chat tool:', error.message);
});
