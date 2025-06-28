#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const program = new Command();
const API_BASE_URL = process.env.MCR_API_URL || 'http://localhost:3000';

program
  .name('mcr')
  .description('CLI for the Model Context Reasoner (MCR) API')
  .version('2.0.0')
  .option(
    '-o, --ontology <file>',
    'Specify an ontology file to use (e.g., ./ontologies/my_ontology.pl)'
  );

const handleApiError = (error) => {
  if (error.response) {
    console.error(
      `Error: ${error.response.status} - ${error.response.data.error.message || error.response.statusText}`
    );
  } else if (error.request) {
    console.error(
      `Error: No response received from MCR API at ${API_BASE_URL}. Is the server running?`
    );
  } else {
    console.error(`Error: ${error.message}`);
  }
  process.exit(1);
};

// --- Session Commands ---
program
  .command('create-session')
  .description('Create a new MCR session')
  .action(async () => {
    try {
      const response = await axios.post(`${API_BASE_URL}/sessions`);
      console.log('Session created:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('get-session <sessionId>')
  .description('Get details of an MCR session')
  .action(async (sessionId) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/sessions/${sessionId}`);
      console.log('Session details:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('delete-session <sessionId>')
  .description('Delete an MCR session')
  .action(async (sessionId) => {
    try {
      const response = await axios.delete(
        `${API_BASE_URL}/sessions/${sessionId}`
      );
      console.log(response.data.message);
    } catch (error) {
      handleApiError(error);
    }
  });

// --- Fact Assertion and Querying ---
program
  .command('assert <sessionId> <text>')
  .description('Assert natural language facts into a session')
  .action(async (sessionId, text) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/sessions/${sessionId}/assert`,
        { text }
      );
      console.log('Facts asserted:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('query [sessionId] [question]')
  .description('Query a session with a natural language question')
  .option(
    '-s, --style <style>',
    'Answer style (e.g., conversational, formal)',
    'conversational'
  )
  .option('-d, --debug', 'Include debug information in the response')
  .option(
    '-o, --ontology <file>',
    'Specify an ontology file to use for this query'
  )
  .action(async (sessionIdArg, questionArg, options) => {
    let currentSessionId = sessionIdArg;
    let ontologyContent = null;

    try {
      if (options.ontology) {
        const ontologyPath = path.resolve(options.ontology);
        if (!fs.existsSync(ontologyPath)) {
          throw new Error(`Ontology file not found: ${ontologyPath}`);
        }
        ontologyContent = fs.readFileSync(ontologyPath, 'utf8');
        console.log(`Using ontology: ${ontologyPath}`);
      }

      if (!currentSessionId || !questionArg) {
        if (!currentSessionId) {
          const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`);
          currentSessionId = sessionResponse.data.sessionId;
          console.log(
            `New session created for interactive query. Session ID: ${currentSessionId}`
          );
        } else {
          await axios.get(`${API_BASE_URL}/sessions/${currentSessionId}`);
          console.log(`Continuing session: ${currentSessionId}`);
        }

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: 'Query> ',
        });

        rl.prompt();

        rl.on('line', async (line) => {
          const question = line.trim();
          if (
            question.toLowerCase() === 'exit' ||
            question.toLowerCase() === 'quit'
          ) {
            rl.close();
            return;
          }

          if (!question) {
            rl.prompt();
            return;
          }

          try {
            const requestBody = {
              query: question,
              options: {
                style: options.style,
                debug: options.debug,
              },
            };
            if (ontologyContent) {
              requestBody.ontology = ontologyContent;
            }

            const response = await axios.post(
              `${API_BASE_URL}/sessions/${currentSessionId}/query`,
              requestBody
            );
            console.log('Query Result:');
            console.log(`  Prolog Query: ${response.data.queryProlog}`);
            console.log(
              `  Raw Result: ${JSON.stringify(response.data.result, null, 2)}`
            );
            console.log(`  Answer: ${response.data.answer}`);
            if (response.data.debug) {
              console.log(
                '  Debug Info:',
                JSON.stringify(response.data.debug, null, 2)
              );
            }
          } catch (error) {
            handleApiError(error);
          }
          rl.prompt();
        }).on('close', async () => {
          if (currentSessionId) {
            try {
              await axios.delete(
                `${API_BASE_URL}/sessions/${currentSessionId}`
              );
              console.log(`Session ${currentSessionId} terminated.`);
            } catch (error) {
              console.error(
                `Failed to terminate session ${currentSessionId}:`,
                error.message
              );
            }
          }
          console.log('Exiting interactive query.');
          process.exit(0);
        });
      } else {
        const requestBody = {
          query: questionArg,
          options: {
            style: options.style,
            debug: options.debug,
          },
        };
        if (ontologyContent) {
          requestBody.ontology = ontologyContent;
        }

        const response = await axios.post(
          `${API_BASE_URL}/sessions/${currentSessionId}/query`,
          requestBody
        );
        console.log('Query Result:');
        console.log(`  Prolog Query: ${response.data.queryProlog}`);
        console.log(
          `  Raw Result: ${JSON.stringify(response.data.result, null, 2)}`
        );
        console.log(`  Answer: ${response.data.answer}`);
        if (response.data.debug) {
          console.log(
            '  Debug Info:',
            JSON.stringify(response.data.debug, null, 2)
          );
        }
      }
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('explain-query <sessionId> <question>')
  .description('Get an explanation for a natural language query')
  .action(async (sessionId, question) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/sessions/${sessionId}/explain-query`,
        { query: question }
      );
      console.log('Query Explanation:');
      console.log(`  Query: ${response.data.query}`);
      console.log(`  Explanation: ${response.data.explanation}`);
    } catch (error) {
      handleApiError(error);
    }
  });

// --- Translation Endpoints ---
program
  .command('nl-to-rules <text>')
  .description('Translate natural language text to Prolog rules')
  .option('-e, --existing-facts <facts>', 'Existing facts for context', '')
  .option(
    '-o, --ontology-context <ontology>',
    'Ontology context for translation',
    ''
  )
  .action(async (text, options) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/translate/nl-to-rules`,
        {
          text,
          existing_facts: options.existingFacts,
          ontology_context: options.ontologyContext,
        }
      );
      console.log(
        'Translated Rules:',
        JSON.stringify(response.data.rules, null, 2)
      );
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('rules-to-nl <rulesFile>')
  .description('Translate Prolog rules from a file to natural language')
  .option(
    '-s, --style <style>',
    'Output style (e.g., formal, conversational)',
    'formal'
  )
  .action(async (rulesFile, options) => {
    try {
      const rulesPath = path.resolve(rulesFile);
      if (!fs.existsSync(rulesPath)) {
        throw new Error(`Rules file not found: ${rulesPath}`);
      }
      const rulesContent = fs.readFileSync(rulesPath, 'utf8');
      const rules = rulesContent
        .split(/\r?\n|\./)
        .filter((line) => line.trim() !== '')
        .map((line) => `${line.trim()}.`);

      const response = await axios.post(
        `${API_BASE_URL}/translate/rules-to-nl`,
        {
          rules,
          style: options.style,
        }
      );
      console.log('Translated Natural Language:', response.data.text);
    } catch (error) {
      handleApiError(error);
    }
  });

// --- Ontology Management ---
program
  .command('add-ontology <name> <rulesFile>')
  .description('Add a new ontology from a Prolog rules file')
  .action(async (name, rulesFile) => {
    try {
      const rulesPath = path.resolve(rulesFile);
      if (!fs.existsSync(rulesPath)) {
        throw new Error(`Rules file not found: ${rulesPath}`);
      }
      const rules = fs.readFileSync(rulesPath, 'utf8');
      const response = await axios.post(`${API_BASE_URL}/ontologies`, {
        name,
        rules,
      });
      console.log('Ontology added:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('update-ontology <name> <rulesFile>')
  .description(
    'Update an existing ontology with rules from a Prolog rules file'
  )
  .action(async (name, rulesFile) => {
    try {
      const rulesPath = path.resolve(rulesFile);
      if (!fs.existsSync(rulesPath)) {
        throw new Error(`Rules file not found: ${rulesPath}`);
      }
      const rules = fs.readFileSync(rulesPath, 'utf8');
      const response = await axios.put(`${API_BASE_URL}/ontologies/${name}`, {
        rules,
      });
      console.log('Ontology updated:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('get-ontologies')
  .description('List all available ontologies')
  .action(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/ontologies`);
      console.log('Available Ontologies:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('get-ontology <name>')
  .description('Get details of a specific ontology')
  .action(async (name) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/ontologies/${name}`);
      console.log('Ontology details:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

program
  .command('delete-ontology <name>')
  .description('Delete an ontology')
  .action(async (name) => {
    try {
      const response = await axios.delete(`${API_BASE_URL}/ontologies/${name}`);
      console.log('Ontology deleted:', response.data);
    } catch (error) {
      handleApiError(error);
    }
  });

// --- Interactive Chat Command ---
program
  .command('chat')
  .description('Start an interactive chat session with the MCR')
  .option(
    '-o, --ontology <file>',
    'Specify an ontology file to use for the session'
  )
  .action(async (options) => {
    let sessionId = null;
    let ontologyContent = null;

    try {
      const sessionResponse = await axios.post(`${API_BASE_URL}/sessions`);
      sessionId = sessionResponse.data.sessionId;
      console.log(`New chat session started. Session ID: ${sessionId}`);

      if (options.ontology) {
        const ontologyPath = path.resolve(options.ontology);
        if (!fs.existsSync(ontologyPath)) {
          throw new Error(`Ontology file not found: ${ontologyPath}`);
        }
        ontologyContent = fs.readFileSync(ontologyPath, 'utf8');
        console.log(`Using ontology: ${ontologyPath}`);
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'You> ',
      });

      rl.prompt();

      rl.on('line', async (line) => {
        const question = line.trim();
        if (
          question.toLowerCase() === 'exit' ||
          question.toLowerCase() === 'quit'
        ) {
          rl.close();
          return;
        }

        if (!question) {
          rl.prompt();
          return;
        }

        try {
          const requestBody = {
            query: question,
            options: {
              style: 'conversational',
            },
          };
          if (ontologyContent) {
            requestBody.ontology = ontologyContent;
          }

          const response = await axios.post(
            `${API_BASE_URL}/sessions/${sessionId}/query`,
            requestBody
          );
          console.log(`MCR> ${response.data.answer}`);
        } catch (error) {
          handleApiError(error);
        }
        rl.prompt();
      }).on('close', async () => {
        if (sessionId) {
          try {
            await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
            console.log(`Session ${sessionId} terminated.`);
          } catch (error) {
            console.error(
              `Failed to terminate session ${sessionId}:`,
              error.message
            );
          }
        }
        console.log('Exiting chat.');
        process.exit(0);
      });
    } catch (error) {
      handleApiError(error);
    }
  });

program.parse(process.argv);
