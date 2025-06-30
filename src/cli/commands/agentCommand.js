const inquirer = require('inquirer');
const { getApiKey, setApiKey } = require('../../config.js');
const {
  createSession: apiCreateSession,
  assertFacts: apiAssertFacts,
  query: apiQuery,
  deleteSession: apiDeleteSession,
  addOntology: apiAddOntology,
  deleteOntology: apiDeleteOntology,
} = require('../api.js');
const { logger } = require('../../logger.js'); // Assuming logger is an object with methods
const { delay } = require('../utils.js');

// Helper to log API interactions
function logInteraction(action, request, response) {
  logger.info(`\n🤖 Agent Action: ${action}`);
  if (request) {
    logger.info('➡️ Request:');
    logger.info(JSON.stringify(request, null, 2));
  }
  if (response) {
    logger.info('⬅️ Response:');
    logger.info(JSON.stringify(response, null, 2));
  }
  logger.info('------------------------------------');
}

async function simpleQADemoAsync() {
  logger.info('\n🚀 Starting Simple Q&A Demo...');
  await delay(1000);

  let sessionId;
  try {
    logger.info('\n1. Creating a new session...');
    await delay(500);
    const sessionResponse = await apiCreateSession();
    sessionId = sessionResponse.sessionId;
    logInteraction('Create Session', null, sessionResponse);
    if (!sessionId) throw new Error('Failed to create session.');

    logger.info(`\n2. Asserting facts into session ${sessionId}...`);
    logger.info('   - "The sky is blue."');
    logger.info('   - "Grass is green."');
    await delay(500);
    const factsToAssert = 'The sky is blue. Grass is green.';
    const assertResponse = await apiAssertFacts(sessionId, factsToAssert);
    logInteraction(
      'Assert Facts',
      { sessionId, facts: factsToAssert },
      assertResponse
    );

    logger.info(`\n3. Querying session ${sessionId}...`);
    await delay(500);
    let question = 'What color is the sky?';
    logger.info(`   ❓ Question: "${question}"`);
    let queryResponse = await apiQuery(sessionId, question);
    logInteraction('Query', { sessionId, question }, queryResponse);

    await delay(500);
    question = 'What color is the grass?';
    logger.info(`   ❓ Question: "${question}"`);
    queryResponse = await apiQuery(sessionId, question);
    logInteraction('Query', { sessionId, question }, queryResponse);
  } catch (error) {
    logger.error(`Error during Simple Q&A Demo: ${error.message}`);
    if (error.response?.data)
      logger.error(`Server Error: ${JSON.stringify(error.response.data)}`);
  } finally {
    if (sessionId) {
      logger.info(`\n4. Cleaning up: Deleting session ${sessionId}...`);
      await delay(500);
      try {
        const deleteResponse = await apiDeleteSession(sessionId);
        logInteraction('Delete Session', { sessionId }, deleteResponse);
      } catch (cleanupError) {
        logger.error(
          `Failed to delete session ${sessionId}: ${cleanupError.message}`
        );
      }
    }
  }
  logger.info('\n🏁 Simple Q&A Demo Finished.');
}

async function familyOntologyDemoAsync() {
  logger.info('\n🚀 Starting Family Ontology Demo...');
  await delay(1000);

  let sessionId;
  const ontologyName = 'family_agent_demo';
  const ontologyFile = 'ontologies/family.pl';

  try {
    logger.info(
      `\n1. Adding '${ontologyName}' ontology from '${ontologyFile}'...`
    );
    await delay(500);
    // First, try to delete if it exists from a previous failed run
    try {
      await apiDeleteOntology(ontologyName, true);
      logInteraction(
        'Delete Ontology (pre-cleanup)',
        { ontologyName },
        { message: 'Attempted pre-cleanup' }
      );
    } catch (_e) {
      // Ignore if it doesn't exist
    }
    const ontologyResponse = await apiAddOntology(ontologyName, ontologyFile);
    logInteraction(
      'Add Ontology',
      { ontologyName, filePath: ontologyFile },
      ontologyResponse
    );

    logger.info('\n2. Creating a new session...');
    await delay(500);
    const sessionResponse = await apiCreateSession(ontologyName); // Pass ontology name to createSession
    sessionId = sessionResponse.sessionId;
    logInteraction(
      'Create Session',
      { defaultOntology: ontologyName },
      sessionResponse
    );
    if (!sessionId) throw new Error('Failed to create session.');

    logger.info(
      `\n3. Asserting family-related facts into session ${sessionId}...`
    );
    logger.info('   - "father(john, mary)."');
    logger.info('   - "mother(jane, mary)."');
    logger.info('   - "father(peter, john)."');
    await delay(500);
    const factsToAssert =
      'father(john, mary). mother(jane, mary). father(peter, john).';
    const assertResponse = await apiAssertFacts(sessionId, factsToAssert);
    logInteraction(
      'Assert Facts',
      { sessionId, facts: factsToAssert },
      assertResponse
    );

    logger.info(
      `\n4. Querying session ${sessionId} using family ontology context...`
    );
    await delay(500);
    let question = 'Who is marys father?';
    logger.info(`   ❓ Question: "${question}"`);
    let queryResponse = await apiQuery(sessionId, question);
    logInteraction('Query', { sessionId, question }, queryResponse);

    await delay(500);
    question = 'Who is marys grandfather?';
    logger.info(`   ❓ Question: "${question}"`);
    queryResponse = await apiQuery(sessionId, question);
    logInteraction('Query', { sessionId, question }, queryResponse);
  } catch (error) {
    logger.error(`Error during Family Ontology Demo: ${error.message}`);
    if (error.response?.data)
      logger.error(`Server Error: ${JSON.stringify(error.response.data)}`);
  } finally {
    if (sessionId) {
      logger.info(`\n5. Cleaning up: Deleting session ${sessionId}...`);
      await delay(500);
      try {
        const deleteResponse = await apiDeleteSession(sessionId);
        logInteraction('Delete Session', { sessionId }, deleteResponse);
      } catch (cleanupError) {
        logger.error(
          `Failed to delete session ${sessionId}: ${cleanupError.message}`
        );
      }
    }
    // Always try to delete the ontology used by the demo
    logger.info(`\n6. Cleaning up: Deleting ontology '${ontologyName}'...`);
    await delay(500);
    try {
      const deleteOntologyResponse = await apiDeleteOntology(
        ontologyName,
        true
      );
      logInteraction(
        'Delete Ontology',
        { ontologyName },
        deleteOntologyResponse
      );
    } catch (cleanupError) {
      logger.error(
        `Failed to delete ontology ${ontologyName}: ${cleanupError.message}`
      );
    }
  }
  logger.info('\n🏁 Family Ontology Demo Finished.');
}

async function freeChatModeAsync() {
  logger.info('\n💬 Starting Free Chat Mode...');
  logger.info('A new session will be created for this chat.');
  logger.info('Type "exit" or "quit" to end the chat.');
  await delay(1000);

  let sessionId;
  try {
    const sessionResponse = await apiCreateSession();
    sessionId = sessionResponse.sessionId;
    logInteraction('Create Session (for Chat)', null, sessionResponse);
    if (!sessionId) {
      logger.error('Failed to create a session for chat. Exiting chat mode.');
      return;
    }
    logger.info(
      `Chat session ${sessionId} created. You can start talking to the MCR.`
    );

    let chatActive = true;
    while (chatActive) {
      const { userInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'userInput',
          message: 'You: ',
        },
      ]);

      if (
        userInput.toLowerCase() === 'exit' ||
        userInput.toLowerCase() === 'quit'
      ) {
        chatActive = false;
        logger.info('Exiting chat mode...');
        break;
      }

      if (!userInput.trim()) {
        continue; // Skip empty input
      }

      try {
        logInteraction(
          'User Input (Chat)',
          { sessionId, question: userInput },
          null
        );
        const queryResponse = await apiQuery(sessionId, userInput);
        // Outputting the answer more directly for chat
        if (queryResponse && queryResponse.answer) {
          logger.info(`MCR: ${queryResponse.answer}`);
        } else {
          logger.info(
            'MCR: (No answer provided or unexpected response format)'
          );
        }
        // Log the full interaction as well for debugging/transparency
        logInteraction(
          'MCR Response (Chat)',
          { sessionId, question: userInput },
          queryResponse
        );

        // Display translation if available - this is key for showing system components
        if (queryResponse.translation) {
          logger.info('🔎 Translation (NL to Prolog):');
          logger.info(queryResponse.translation);
        }
        if (queryResponse.prologOutput) {
          logger.info('⚙️ Prolog Output:');
          logger.info(
            queryResponse.prologOutput.trim() || '(No direct Prolog output)'
          );
        }
      } catch (error) {
        logger.error(`Error during chat query: ${error.message}`);
        if (error.response?.data)
          logger.error(`Server Error: ${JSON.stringify(error.response.data)}`);
        // Optionally, decide if a single error should terminate the chat
      }
    }
  } catch (error) {
    logger.error(`Error setting up free chat mode: ${error.message}`);
  } finally {
    if (sessionId) {
      logger.info(`Cleaning up: Deleting chat session ${sessionId}...`);
      await delay(500);
      try {
        const deleteResponse = await apiDeleteSession(sessionId);
        logInteraction('Delete Session (Chat)', { sessionId }, deleteResponse);
      } catch (cleanupError) {
        logger.error(
          `Failed to delete chat session ${sessionId}: ${cleanupError.message}`
        );
      }
    }
  }
  logger.info('🏁 Free Chat Mode Finished.');
}

async function agentFlowAsync() {
  logger.info('Welcome to Agent Mode!');

  // API Key Handling (remains the same)
  let apiKey = getApiKey('gemini');
  if (!apiKey) {
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message:
          'Please enter your Gemini API Key (or press Enter to skip if not needed for selected demo):',
        mask: '*',
      },
    ]);
    apiKey = answers.apiKey;
    if (apiKey) {
      setApiKey('gemini', apiKey);
      logger.info('Gemini API Key set for the session.');
    } else {
      logger.warn(
        'Gemini API Key not provided. LLM-dependent features may not work.'
      );
    }
  } else {
    logger.info('Using existing Gemini API Key.');
  }

  // Demo selection and main loop
  let keepRunning = true;
  while (keepRunning) {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'What would you like to do?',
        choices: [
          { name: 'Simple Q&A Demo', value: 'simpleQA' },
          { name: 'Family Ontology Demo', value: 'familyOntology' },
          { name: 'Free Chat with MCR', value: 'freeChat' }, // Enabled
          new inquirer.Separator(),
          { name: 'Exit Agent Mode', value: 'exit' },
        ],
      },
    ]);

    switch (choice) {
      case 'simpleQA':
        await simpleQADemoAsync();
        break;
      case 'familyOntology':
        await familyOntologyDemoAsync();
        break;
      case 'freeChat':
        await freeChatModeAsync(); // Call the new function
        break;
      case 'exit':
        keepRunning = false;
        break;
      default:
        logger.warn('Invalid choice.');
    }
    if (keepRunning) {
      await inquirer.prompt([
        {
          type: 'input',
          name: 'continue',
          message: 'Press Enter to continue...',
        },
      ]);
    }
  }

  logger.info('Exiting Agent Mode. Goodbye!');
}

// This function will be imported by mcr-cli.js
function registerAgentCommand(program) {
  program
    .command('agent')
    .description('Run MCR in Agent Mode to interact with demos or free chat.')
    .action(async (_options) => {
      try {
        await agentFlowAsync();
      } catch (error) {
        logger.error(`Error launching agent mode: ${error.message}`);
        process.exit(1);
      }
    });
}

module.exports = { registerAgentCommand };
