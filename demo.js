// new/demo.js
const axios = require('axios');
const config = require('./src/config'); // To get server URL
const logger = require('./src/logger'); // Using the same logger
const winston = require('winston'); // Import winston for format utilities
const { checkAndStartServer } = require('./src/cliUtils');

const API_BASE_URL = `http://${config.server.host}:${config.server.port}/api/v1`;

// Configure logger for demo script - simpler console output
logger.transports.forEach((t) => {
  if (t instanceof winston.transports.Console) {
    t.format = winston.format.combine(
      // Use winston.format directly
      // winston.format.colorize(), // Optional: remove color for cleaner script output
      winston.format.printf(
        (info) => `${info.level.toUpperCase()}: ${info.message}`
      )
    );
  }
});
logger.level = 'info'; // Set log level for the demo

async function runDemo() {
  let sessionId;
  console.log('🚀 Starting MCR Demo...');
  console.log(`   Targeting API: ${API_BASE_URL}`);

  const serverReady = await checkAndStartServer();
  if (!serverReady) {
    console.error(
      '❌ Demo aborted: Failed to connect to or start the MCR server.'
    );
    console.log(
      '   Please check server logs and configuration. You might need to start it manually: node mcr.js'
    );
    return; // Exit if server cannot be started
  }
  console.log(''); // Newline for cleaner output after server check

  try {
    // 1. Create a session
    logger.info('Step 1: Creating a new session...');
    console.log('--- Step 1: Creating Session ---');
    const createResponse = await axios.post(`${API_BASE_URL}/sessions`);
    sessionId = createResponse.data.id;
    console.log(`✅ Session created successfully. ID: ${sessionId}\n`);
    logger.info(`Session created: ${sessionId}`);

    // 2. Assert facts
    logger.info('Step 2: Asserting facts...');
    console.log('--- Step 2: Asserting Facts ---');
    const factsToAssert = [
      'The sky is blue.',
      'Socrates is a human.',
      'All humans are mortal.',
      "John is Mary's father.",
      'Mary is a doctor.',
    ];

    for (const fact of factsToAssert) {
      console.log(`   Asserting: "${fact}"`);
      const assertResponse = await axios.post(
        `${API_BASE_URL}/sessions/${sessionId}/assert`,
        { text: fact }
      );
      console.log(`   ✅ Server: ${assertResponse.data.message}`);
      if (
        assertResponse.data.addedFacts &&
        assertResponse.data.addedFacts.length > 0
      ) {
        assertResponse.data.addedFacts.forEach((f) =>
          console.log(`     -> Added to KB: ${f}`)
        );
      }
      logger.info(
        `Asserted: "${fact}", Server response: ${assertResponse.data.message}`
      );
    }
    console.log('✅ Facts asserted successfully.\n');

    // 3. Query the session
    logger.info('Step 3: Querying the session...');
    console.log('--- Step 3: Querying Session ---');
    const questions = [
      'What color is the sky?',
      'Is Socrates mortal?',
      "Who is Mary's father?",
      'Is Mary a doctor?',
      'Who is mortal?', // A more open-ended query
    ];

    for (const question of questions) {
      console.log(`   Querying: "${question}"`);
      const queryResponse = await axios.post(
        `${API_BASE_URL}/sessions/${sessionId}/query`,
        { query: question }
      );
      console.log(`   🤖 MCR Answer: ${queryResponse.data.answer}`);
      logger.info(
        `Question: "${question}", Answer: "${queryResponse.data.answer}"`
      );
      if (queryResponse.data.debugInfo) {
        logger.debug('Query Debug Info:', {
          prologQuery: queryResponse.data.debugInfo.prologQuery,
          prologResults: queryResponse.data.debugInfo.prologResultsJSON,
        });
      }
    }
    console.log('✅ Queries completed.\n');
  } catch (error) {
    console.error('❌ DEMO FAILED: An error occurred.');
    if (error.response) {
      console.error('   Error Status:', error.response.status);
      console.error(
        '   Error Data:',
        JSON.stringify(error.response.data, null, 2)
      );
      logger.error('Demo failed with API error:', {
        status: error.response.status,
        data: error.response.data,
      });
    } else {
      console.error('   Error Message:', error.message);
      logger.error('Demo failed with error:', error.message);
    }
  } finally {
    // 4. Delete the session (cleanup)
    if (sessionId) {
      try {
        logger.info('Step 4: Deleting the session...');
        console.log('--- Step 4: Deleting Session ---');
        await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
        console.log(`✅ Session ${sessionId} deleted successfully.\n`);
        logger.info(`Session deleted: ${sessionId}`);
      } catch (error) {
        console.error(
          '⚠️ Error deleting session:',
          error.response ? error.response.data.error.message : error.message
        );
        logger.warn(
          'Error deleting session:',
          error.response ? error.response.data : error.message
        );
      }
    }
    console.log('🏁 MCR Demo Finished.');
  }
}

console.log('MCR Demo Script');
console.log('-------------------------');

// Removed manual server start instruction and timeout, checkAndStartServer handles it.
runDemo().catch((error) => {
  logger.error('Critical error in demo script:', error);
  console.error('💥 Critical error in demo script:', error.message);
});
