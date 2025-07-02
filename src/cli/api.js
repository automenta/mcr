const axios = require('axios');
const config = require('../config'); // Use the new config system
const { handleApiError } = require('../cliUtils'); // Use the new error handler

const API_BASE_URL = `http://${config.server.host}:${config.server.port}`;

/**
 * API client for standard CLI commands.
 * Methods will call `handleApiError` on failure, which exits the process.
 */
const apiClient = {
  /**
   * Performs a GET request.
   * @param {string} endpoint - The API endpoint path (e.g., '/sessions').
   * @param {object} [params] - URL parameters.
   * @param {object} [programOptions] - Commander program options for error handling.
   * @returns {Promise<object>} A promise that resolves with the response data.
   */
  get: async (endpoint, params, programOptions) => {
    try {
      const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
        params,
      });
      return response.data; // Axios wraps response in 'data'
    } catch (error) {
      handleApiError(error, { ...programOptions, apiBaseUrl: API_BASE_URL });
      // handleApiError exits, so this line won't be reached, but keeps linters happy.
      throw error;
    }
  },

  /**
   * Performs a POST request.
   * @param {string} endpoint - The API endpoint path.
   * @param {object} data - The request body.
   * @param {object} [programOptions] - Commander program options for error handling.
   * @returns {Promise<object>} A promise that resolves with the response data.
   */
  post: async (endpoint, data, programOptions) => {
    try {
      const response = await axios.post(`${API_BASE_URL}${endpoint}`, data);
      return response.data;
    } catch (error) {
      handleApiError(error, { ...programOptions, apiBaseUrl: API_BASE_URL });
      throw error;
    }
  },

  /**
   * Performs a PUT request.
   * @param {string} endpoint - The API endpoint path.
   * @param {object} data - The request body.
   * @param {object} [programOptions] - Commander program options for error handling.
   * @returns {Promise<object>} A promise that resolves with the response data.
   */
  put: async (endpoint, data, programOptions) => {
    try {
      const response = await axios.put(`${API_BASE_URL}${endpoint}`, data);
      return response.data;
    } catch (error) {
      handleApiError(error, { ...programOptions, apiBaseUrl: API_BASE_URL });
      throw error;
    }
  },

  /**
   * Performs a DELETE request.
   * @param {string} endpoint - The API endpoint path.
   * @param {object} [programOptions] - Commander program options for error handling.
   * @returns {Promise<object>} A promise that resolves with the response data.
   */
  delete: async (endpoint, programOptions) => {
    try {
      const response = await axios.delete(`${API_BASE_URL}${endpoint}`);
      return response.data;
    } catch (error) {
      handleApiError(error, { ...programOptions, apiBaseUrl: API_BASE_URL });
      throw error;
    }
  },
};

// We can add the TUI-specific helper functions (like old tuiApiClientInstance and its wrappers)
// here later if needed, once we get to the TUI implementation.
// For now, just the exiting apiClient is fine for basic CLI commands.

// Function for non-exiting API calls, suitable for status checks or TUI
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

/**
 * Gets server status without exiting on connection error.
 * @returns {Promise<object>} Server status or error object.
 */
async function getServerStatus() {
  try {
    const response = await axiosInstance.get('/');
    return { success: true, data: response.data };
  } catch (error) {
    if (error.isAxiosError && !error.response) {
      return {
        success: false,
        status: 'offline',
        message: `MCR API server not reachable at ${API_BASE_URL}.`,
        error,
      };
    } else if (error.response) {
      return {
        success: false,
        status: 'error_response',
        message: `Server at ${API_BASE_URL} responded with error ${error.response.status}.`,
        details: error.response.data,
        error,
      };
    } else {
      return {
        success: false,
        status: 'unknown_error',
        message: `Failed to get status from ${API_BASE_URL}: ${error.message}`,
        error,
      };
    }
  }
}

// This instance is for TUI or other non-exiting uses.
// It returns promises; errors should be handled by the caller.
const tuiApiClientInstance = axios.create({
  baseURL: API_BASE_URL,
});

// Helper functions using tuiApiClientInstance for the TUI (non-exiting)
// These return Promises resolving to response.data or throw Axios errors for caller to handle.

/** Creates a new MCR session. @returns {Promise<object>} Session details. */
const createSessionTui = () =>
  tuiApiClientInstance.post('/sessions').then((res) => res.data);

/**
 * Retrieves details for a specific session.
 * @param {string} sessionId - The ID of the session.
 * @returns {Promise<object>} Session details.
 */
const getSessionTui = (sessionId) =>
  tuiApiClientInstance.get(`/sessions/${sessionId}`).then((res) => res.data);

/**
 * Deletes a specific session.
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {Promise<object>} Confirmation message.
 */
const deleteSessionTui = (sessionId) =>
  tuiApiClientInstance.delete(`/sessions/${sessionId}`).then((res) => res.data);

/**
 * Asserts facts into a session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} text - Natural language text containing facts to assert.
 * @returns {Promise<object>} Assertion results.
 */
const assertFactsTui = (sessionId, text) =>
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
const queryTui = (
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
const explainQueryTui = (sessionId, queryText) =>
  tuiApiClientInstance
    .post(`/sessions/${sessionId}/explain-query`, { query: queryText })
    .then((res) => res.data);

/** Lists all global ontologies. @returns {Promise<Array<object>>} Array of ontology objects. */
const listOntologiesTui = () =>
  tuiApiClientInstance.get('/ontologies').then((res) => res.data);

/**
 * Retrieves a specific global ontology.
 * @param {string} name - The name of the ontology.
 * @returns {Promise<object>} Ontology details.
 */
const getOntologyTui = (name) =>
  tuiApiClientInstance.get(`/ontologies/${name}`).then((res) => res.data);

/**
 * Adds a new global ontology.
 * @param {string} name - The name for the new ontology.
 * @param {string} rules - Prolog rules as a string.
 * @returns {Promise<object>} Details of the added ontology.
 */
const addOntologyTui = (name, rules) =>
  tuiApiClientInstance
    .post('/ontologies', { name, rules })
    .then((res) => res.data);

/**
 * Updates an existing global ontology.
 * @param {string} name - The name of the ontology to update.
 * @param {string} rules - New Prolog rules as a string.
 * @returns {Promise<object>} Details of the updated ontology.
 */
const updateOntologyTui = (name, rules) =>
  tuiApiClientInstance
    .put(`/ontologies/${name}`, { rules })
    .then((res) => res.data);

/**
 * Deletes a global ontology.
 * @param {string} name - The name of the ontology to delete.
 * @returns {Promise<object>} Confirmation message.
 */
const deleteOntologyTui = (name) =>
  tuiApiClientInstance.delete(`/ontologies/${name}`).then((res) => res.data);

/**
 * Translates natural language text to Prolog rules.
 * @param {string} text - Natural language text.
 * @param {string} [existingFacts=null] - Optional string of existing Prolog facts.
 * @param {string} [ontologyContext=null] - Optional string of Prolog rules for context.
 * @returns {Promise<object>} Translation results.
 */
const nlToRulesTui = (text, existingFacts = null, ontologyContext = null) => {
  const payload = { text };
  if (existingFacts) payload.existing_facts = existingFacts; // Match old CLI key
  if (ontologyContext) payload.ontology_context = ontologyContext; // Match old CLI key
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
const rulesToNlTui = (rules, style = 'formal') => {
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
const listPromptsTui = () =>
  tuiApiClientInstance.get('/prompts').then((res) => res.data);

/**
 * Formats a prompt template with given variables (dry run).
 * @param {string} templateName - The name of the prompt template.
 * @param {object} inputVariables - Key-value pairs for template variables.
 * @returns {Promise<object>} Debugging information including the formatted prompt.
 */
const debugFormatPromptTui = (templateName, inputVariables) =>
  tuiApiClientInstance
    .post('/debug/format-prompt', { templateName, inputVariables })
    .then((res) => res.data);

module.exports = {
  apiClient, // For CLI commands that should exit on error
  API_BASE_URL,
  getServerStatus, // For status command (non-exiting GET to /)

  // Export TUI helper functions
  createSessionTui,
  getSessionTui,
  deleteSessionTui,
  assertFactsTui,
  queryTui,
  explainQueryTui,
  listOntologiesTui,
  getOntologyTui,
  addOntologyTui,
  updateOntologyTui,
  deleteOntologyTui,
  nlToRulesTui,
  rulesToNlTui,
  listPromptsTui,
  debugFormatPromptTui,
};
