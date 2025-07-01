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

    const serverMessage = errOutput.error.message;

    if (isJsonOutput) {
      // Keep JSON output concise for machine consumption
      console.error(JSON.stringify(errOutput, null, 2));
    } else {
      const errorEmoji = status >= 500 ? '💥' : (status >= 400 ? '⚠️' : '❗');
      console.error(`${errorEmoji} Error ${status}: ${serverMessage}`); // Base message with emoji

      // Add specific suggestions based on status code
      switch (status) {
        case 400:
          console.error(
            'Details: The server indicated a problem with the input provided (e.g., invalid parameters, malformed data).'
          );
          if (errOutput.error.details)
            console.error(
              `Server Specifics: ${typeof errOutput.error.details === 'string' ? errOutput.error.details : JSON.stringify(errOutput.error.details)}`
            );
          console.error(
            "Suggestion: Please check your command syntax, parameter values, and any file paths. Use '--help' for command usage."
          );
          break;
        case 401:
          console.error(
            'Details: The request lacks valid authentication credentials.'
          );
          console.error(
            'Suggestion: Ensure your API key or authentication method is correctly configured (if MCR uses authentication).'
          );
          break;
        case 403:
          console.error(
            'Details: You do not have permission to access this resource or perform this action.'
          );
          console.error(
            'Suggestion: Check your credentials or permissions. Contact an administrator if you believe this is incorrect.'
          );
          break;
        case 404:
          console.error(
            'Details: The requested resource (e.g., session, ontology) could not be found on the server.'
          );
          if (error.config?.url)
            console.error(`Attempted URL: ${API_URL}${error.config.url}`);
          console.error(
            "Suggestion: Verify the ID/name is correct. For sessions, they may have expired or been deleted. For ontologies, you can list available ones (e.g., 'mcr-cli get-ontologies')."
          );
          break;
        case 500:
        case 501:
        case 502:
        case 503:
        case 504:
          console.error(
            'Details: The server encountered an internal error or is temporarily unavailable.'
          );
          console.error(
            'Suggestion: This is likely a server-side issue. Please try again later. If the problem persists, report this error, including the CorrelationId if available, to the MCR maintainers or check server logs.'
          );
          break;
        default:
          // For other 4xx/5xx errors not specifically handled
          if (status >= 400 && status < 500) {
            console.error(
              'Details: The server indicated an issue with your request. Please check the parameters and try again.'
            );
          } else if (status >= 500 && status < 600) {
            console.error(
              'Details: The server encountered an issue processing your request. Please try again later.'
            );
          }
      }

      // Print common additional info if available
      if (errOutput.error.type) console.error(`Type: ${errOutput.error.type}`);
      if (errOutput.error.code) console.error(`Code: ${errOutput.error.code}`);
      if (errOutput.error.correlationId)
        console.error(`CorrelationId: ${errOutput.error.correlationId}`);

      // General details, if not handled by specific status code message and details is present
      if (errOutput.error.details && status !== 400) {
        // 400 handler prints its own details via "Server Specifics"
        const detailsOutput =
          typeof errOutput.error.details === 'string'
            ? errOutput.error.details
            : JSON.stringify(errOutput.error.details, null, 2);
        console.error(`Server-Provided Details: ${detailsOutput}`);
      }
    }
  } else if (error.request) {
    // Request was made but no response received
    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          {
            error: {
              message: `🔌 Connection Issue: No response received from MCR API server at ${API_URL}.`,
              type: 'ConnectionError',
              suggestions: [
                'Ensure the MCR server is running.',
                `Check if the API URL '${API_URL}' in your configuration is correct.`,
                'Verify network connectivity to the server host and port.',
                'If using Docker, ensure the container is running and ports are correctly mapped.',
              ],
            },
          },
          null,
          2
        )
      );
    } else {
      console.error(
        `🔌 Error: Connection Issue - Could not connect to the MCR API server at ${API_URL}.`
      );
      console.error('Suggestions:');
      console.error('  - ✅ Ensure the MCR server is running.');
      console.error(
        `  - Check if the API URL '${API_URL}' in your configuration is correct (e.g., .env file, environment variables).`
      );
      console.error(
        '  - Verify network connectivity to the server host and port.'
      );
      console.error(
        '  - If using Docker, ensure the container is running and ports are correctly mapped.'
      );
    }
  } else {
    // Something happened in setting up the request that triggered an Error
    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          {
            error: {
              message: `🛠️ Client Setup Error: ${error.message}`,
              type: 'ClientSetupError',
              suggestion:
                'This could be a local network problem, DNS issue, or an internal CLI error. Check your network and command parameters.',
            },
          },
          null,
          2
        )
      );
    } else {
      console.error(
        `🛠️ Error: Client Setup - An issue occurred before the request could be sent: ${error.message}`
      );
      console.error(
        'Suggestion: This could be a local network problem, DNS issue, or an internal CLI error. Check your network and command parameters.'
      );
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

// tuiApiClientInstance and its associated helper functions have been removed
// as the TUI is no longer part of the project, and demos now use mcrCore directly.
// The remaining CLI commands are expected to use `apiClient` which handles errors by exiting.

module.exports = {
  handleApiError, // Export for direct use by CLI commands if needed
  apiClient, // For CLI commands that should exit on error
  // tuiApiClientInstance and its helper functions removed as TUI is removed and demos use mcrCore directly.
  API_BASE_URL: API_URL,
};
