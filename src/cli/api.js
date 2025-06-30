/* eslint-disable no-console */
const axios = require('axios');
const ConfigManager = require('../config'); // Use ConfigManager for consistent URL

// Load config to get API URL
let API_URL;
try {
  const config = ConfigManager.get();
  API_URL = `http://${config.server.host}:${config.server.port}`;
} catch (e) {
  // Fallback if config isn't fully loaded yet (e.g. during initial setup)
  API_URL = process.env.MCR_API_URL || 'http://localhost:8080';
  console.warn(
    `MCR API URL not found in config, falling back to ${API_URL}. Error: ${e.message}`
  );
}

/**
 * Centralized error handler for CLI commands that are designed to exit on API error.
 * It formats the error output based on whether JSON output is requested and then exits the process.
 * @param {Error} error - The error object, typically from an Axios request.
 * @param {object} [programOptions={}] - Commander program options, used to check for `--json` flag.
 */
const handleApiError = (error, programOptions = {}) => {
  const isJsonOutput =
    programOptions && typeof programOptions.json === 'boolean'
      ? programOptions.json
      : process.argv.includes('--json'); // Fallback, less reliable

  if (error.response) {
    const errorData = error.response.data?.error ||
      error.response.data || {
        // Also check error.response.data directly
        message: error.response.statusText || 'Unknown server error',
      };
    const correlationId = error.response.headers?.['x-correlation-id'];
    const status = error.response.status;

    const errOutput = {
      error: {
        status: status,
        message:
          errorData.message ||
          (typeof errorData === 'string'
            ? errorData
            : 'Unknown error structure'),
        type: errorData.type,
        code: errorData.code,
        correlationId: correlationId || errorData.correlationId,
        details: errorData.details,
      },
    };

    if (isJsonOutput) {
      console.error(JSON.stringify(errOutput, null, 2));
    } else {
      console.error(`Error: ${status} - ${errOutput.error.message}`);
      if (errOutput.error.type) console.error(`Type: ${errOutput.error.type}`);
      if (errOutput.error.code) console.error(`Code: ${errOutput.error.code}`);
      if (errOutput.error.correlationId)
        console.error(`CorrelationId: ${errOutput.error.correlationId}`);
      if (errOutput.error.details)
        console.error(`Details: ${errOutput.error.details}`);
    }
  } else if (error.request) {
    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          {
            error: {
              message: `No response received from MCR API at ${API_URL}. Is the server running?`,
              type: 'ConnectionError',
            },
          },
          null,
          2
        )
      );
    } else {
      console.error(
        `Error: No response received from MCR API at ${API_URL}. Is the server running?`
      );
    }
  } else {
    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          { error: { message: error.message, type: 'ClientSetupError' } },
          null,
          2
        )
      );
    } else {
      console.error('Error:', error.message);
    }
  }
  process.exit(1);
};

/**
 * API client for standard CLI commands.
 * Methods will call `handleApiError` on failure, which exits the process.
 * Suitable for commands where execution should stop if an API call fails.
 */
const apiClient = {
  /**
   * Performs a GET request.
   * @param {string} url - The API endpoint path.
   * @param {object} [params] - URL parameters.
   * @param {object} [programOptions] - Commander program options for error handling.
   * @returns {Promise<object>} A promise that resolves with the response data.
   */
  get: (url, params, programOptions) =>
    axios
      .get(`${API_URL}${url}`, { params })
      .catch((err) => handleApiError(err, programOptions)),
  /**
   * Performs a POST request.
   * @param {string} url - The API endpoint path.
   * @param {object} data - The request body.
   * @param {object} [programOptions] - Commander program options for error handling.
   * @returns {Promise<object>} A promise that resolves with the response data.
   */
  post: (url, data, programOptions) =>
    axios
      .post(`${API_URL}${url}`, data)
      .catch((err) => handleApiError(err, programOptions)),
  put: (url, data, programOptions) =>
    axios
      .put(`${API_URL}${url}`, data)
      .catch((err) => handleApiError(err, programOptions)),
  delete: (url, programOptions) =>
    axios
      .delete(`${API_URL}${url}`)
      .catch((err) => handleApiError(err, programOptions)),
};

// tuiApiClient: Axios instance for TUI & other non-exiting uses.
// It returns promises; errors should be handled by the caller.
const tuiApiClientInstance = axios.create({
  baseURL: API_URL,
});

// Helper functions using tuiApiClientInstance. They return Promises resolving to response.data.
// Errors are expected to be caught by the calling function (e.g., in the TUI).

/** Creates a new MCR session. @returns {Promise<object>} Session details. */
const createSession = () =>
  tuiApiClientInstance.post('/sessions').then((res) => res.data);

/**
 * Retrieves details for a specific session.
 * @param {string} sessionId - The ID of the session.
 * @returns {Promise<object>} Session details.
 */
const getSession = (sessionId) =>
  tuiApiClientInstance.get(`/sessions/${sessionId}`).then((res) => res.data);

/**
 * Deletes a specific session.
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {Promise<object>} Confirmation message.
 */
const deleteSession = (sessionId) =>
  tuiApiClientInstance.delete(`/sessions/${sessionId}`).then((res) => res.data);

/**
 * Asserts facts into a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} text - Natural language text containing facts to assert.
 * @returns {Promise<object>} Assertion results.
 */
const assertFacts = (sessionId, text) =>
  tuiApiClientInstance
    .post(`/sessions/${sessionId}/assert`, { text })
    .then((res) => res.data);

/**
 * Queries a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} queryText - Natural language query.
 * @param {object} [options={ style: 'conversational', debug: false }] - Query options.
 * @param {string} [dynamicOntologyContent=null] - Optional string of Prolog rules for dynamic context.
 * @returns {Promise<object>} Query results.
 */
const query = (
  sessionId,
  queryText,
  options = { style: 'conversational', debug: false },
  dynamicOntologyContent = null
) => {
  const payload = { query: queryText, options };
  if (dynamicOntologyContent) {
    payload.ontology = dynamicOntologyContent;
  }
  return tuiApiClientInstance
    .post(`/sessions/${sessionId}/query`, payload)
    .then((res) => res.data);
};

/**
 * Explains a query against a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} queryText - Natural language query to explain.
 * @returns {Promise<object>} Explanation results.
 */
const explainQuery = (sessionId, queryText) =>
  tuiApiClientInstance
    .post(`/sessions/${sessionId}/explain-query`, { query: queryText })
    .then((res) => res.data);

/** Lists all global ontologies. @returns {Promise<Array<object>>} Array of ontology objects. */
const listOntologies = () =>
  tuiApiClientInstance.get('/ontologies').then((res) => res.data);

/**
 * Retrieves a specific global ontology.
 * @param {string} name - The name of the ontology.
 * @returns {Promise<object>} Ontology details.
 */
const getOntology = (name) =>
  tuiApiClientInstance.get(`/ontologies/${name}`).then((res) => res.data);

/**
 * Adds a new global ontology.
 * @param {string} name - The name for the new ontology.
 * @param {string} rules - Prolog rules as a string.
 * @returns {Promise<object>} Details of the added ontology.
 */
const addOntology = (name, rules) =>
  tuiApiClientInstance
    .post('/ontologies', { name, rules })
    .then((res) => res.data);

/**
 * Updates an existing global ontology.
 * @param {string} name - The name of the ontology to update.
 * @param {string} rules - New Prolog rules as a string.
 * @returns {Promise<object>} Details of the updated ontology.
 */
const updateOntology = (name, rules) =>
  tuiApiClientInstance
    .put(`/ontologies/${name}`, { rules })
    .then((res) => res.data);

/**
 * Deletes a global ontology.
 * @param {string} name - The name of the ontology to delete.
 * @returns {Promise<object>} Confirmation message.
 */
const deleteOntology = (name) =>
  tuiApiClientInstance.delete(`/ontologies/${name}`).then((res) => res.data);

/**
 * Translates natural language text to Prolog rules.
 * @param {string} text - Natural language text.
 * @param {string} [existingFacts=null] - Optional string of existing Prolog facts.
 * @param {string} [ontologyContext=null] - Optional string of Prolog rules for context.
 * @returns {Promise<object>} Translation results.
 */
const nlToRules = (text, existingFacts = null, ontologyContext = null) => {
  const payload = { text };
  if (existingFacts) payload.existing_facts = existingFacts;
  if (ontologyContext) payload.ontology_context = ontologyContext;
  return tuiApiClientInstance
    .post('/translate/nl-to-rules', payload)
    .then((res) => res.data);
};

/**
 * Translates Prolog rules to natural language.
 * @param {string|Array<string>} rules - Prolog rules as a string (newline-separated) or an array of rule strings.
 * @param {string} [style='formal'] - Translation style ('formal' or 'conversational').
 * @returns {Promise<object>} Translation results.
 */
const rulesToNl = (rules, style = 'formal') => {
  const rulesArray = Array.isArray(rules)
    ? rules
    : String(rules)
        .split(/\r?\n|\.(?=\s|$)/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .map((line) => (line.endsWith('.') ? line : `${line}.`));
  return tuiApiClientInstance
    .post('/translate/rules-to-nl', { rules: rulesArray, style })
    .then((res) => res.data);
};

/** Lists all available prompt templates. @returns {Promise<object>} Object mapping template names to template strings. */
const listPrompts = () =>
  tuiApiClientInstance.get('/prompts').then((res) => res.data);

/**
 * Formats a prompt template with given variables (dry run).
 * @param {string} templateName - The name of the prompt template.
 * @param {object} inputVariables - Key-value pairs for template variables.
 * @returns {Promise<object>} Debugging information including the formatted prompt.
 */
const debugFormatPrompt = (templateName, inputVariables) =>
  tuiApiClientInstance
    .post('/debug/format-prompt', { templateName, inputVariables })
    .then((res) => res.data);

/** Retrieves the server status. @returns {Promise<object>} Server status information. */
const getServerStatus = () =>
  tuiApiClientInstance.get('/').then((res) => res.data);

module.exports = {
  handleApiError, // Export for direct use by CLI commands if needed
  apiClient, // For CLI commands that should exit on error
  // tuiApiClientInstance, // No longer need to export the instance directly
  API_BASE_URL: API_URL,

  // New helper functions (primarily for TUI, but can be used by CLI commands if they handle errors)
  createSession,
  getSession,
  deleteSession,
  assertFacts,
  query,
  explainQuery,
  listOntologies,
  getOntology,
  addOntology,
  updateOntology,
  deleteOntology,
  nlToRules,
  rulesToNl,
  listPrompts,
  debugFormatPrompt,
  getServerStatus,
};
