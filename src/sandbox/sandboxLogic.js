/* eslint-disable no-console */
const inquirer = require('inquirer');
const mcrService = require('../mcrService'); // New MCR Service
const config = require('../config'); // For LLM info
// const { ApiError } = require('../errors'); // If needed for specific error handling

async function sandboxLoop() {
  console.log('Initializing MCR Services for Sandbox...');
  // Services are generally ready on require in the new model.
  // Log LLM provider from loaded config.
  if (config.llm && config.llm.provider) {
    console.log(`MCR Services Initialized. Using LLM Provider: ${config.llm.provider}, Model: ${config.llm.modelName[config.llm.provider] || 'N/A'}`);
  } else {
    console.error('LLM configuration not found. Sandbox might not function correctly.');
    // Optionally exit if LLM config is critical: process.exit(1);
  }
  console.log('---');

  let sessionId = null;
  try {
    console.log('Creating sandbox session...');
    // mcrService.createSession is synchronous
    const sessionData = mcrService.createSession();
    sessionId = sessionData.sessionId;
    console.log(`Sandbox session created: ${sessionId}`);
    console.log('---');

    let keepGoing = true;
    while (keepGoing) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'nlQuery',
          message: 'Enter your Natural Language query (or type "exit" to quit):',
        },
      ]);
      const { nlQuery } = answers;

      if (nlQuery.toLowerCase() === 'exit') {
        keepGoing = false;
        continue;
      }

      if (!nlQuery.trim()) {
        console.log('Query cannot be empty.');
        console.log('---');
        continue;
      }

      const confirmAnswers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmQuery',
          message: `Submit query: "${nlQuery}"?`,
          default: true,
        },
      ]);

      if (confirmAnswers.confirmQuery) {
        console.log('Processing query...');
        try {
          // mcrService.querySessionWithNL is async and takes options object
          const response = await mcrService.querySessionWithNL(sessionId, nlQuery, {
            style: 'verbose', // Or 'conversational'
            debug: true, // Request debug info
          });

          console.log('\n=== Sandbox Output ===');
          console.log(`NL Input: ${nlQuery}`);
          console.log('---');

          if (response.debugInfo?.prologQuery) { // Adjusted field name from old sandbox
            console.log('Query (Logic - Generated Prolog):');
            console.log(response.debugInfo.prologQuery);
            console.log('---');
          }

          // mcrService.querySessionWithNL response structure:
          // { success, answer, debugInfo: { prologQuery, prologResults, knowledgeBaseSnapshot, naturalLanguageAnswer, error? } }
          // The 'result' field in old sandbox was simplified. New debugInfo.prologResults is the raw array/object.

          if (response.debugInfo?.prologResults) {
            console.log('Results (Logic - Reasoner Output):');
            console.log(JSON.stringify(response.debugInfo.prologResults, null, 2));
            console.log('---');
          }

          console.log('Result (NL - MCR):');
          console.log(response.answer || 'No NL answer provided by MCR.');
          console.log('---');

          // zeroShotLmAnswer is not part of mcrService.querySessionWithNL response
          // console.log('Result (NL - Zero-shot LLM for comparison):');
          // console.log(response.zeroShotLmAnswer || 'No zero-shot NL answer provided.');
          // console.log('======================\n');

        } catch (error) { // Errors from mcrService calls or other issues
          const errorMessage = error.message || 'Unknown error during query processing.';
          console.error(`Query Error: ${errorMessage}`);
          if (error.stack) console.error(error.stack);
          // If it's an error object from mcrService (which includes success:false)
          if (error.error) { // Assuming mcrService might return { success:false, error: 'message' }
             console.error('Service Error Details:', error.error);
          }
        }
      } else {
        console.log('Query cancelled.');
      }
      console.log('---');
    }
  } catch (error) {
    console.error(`Sandbox Error: ${error.message}`);
    if (error.stack) console.error(error.stack);
  } finally {
    if (sessionId) {
      try {
        console.log(`\nDeleting sandbox session: ${sessionId}...`);
        // mcrService.deleteSession is synchronous
        const deleteResp = mcrService.deleteSession(sessionId);
        console.log(deleteResp.message || 'Sandbox session deleted.');
      } catch (e) {
        console.error(`Error deleting session ${sessionId}: ${e.message}`);
        if (e.stack) console.error(e.stack);
      }
    }
    console.log('Exiting sandbox.');
  }
}

module.exports = { sandboxLoop };
