/* eslint-disable no-console */
const axios = require('axios');

const API_URL = process.env.MCR_API_URL || 'http://localhost:8080';

// Updated handleApiError to be aware of --json flag
const handleApiError = (error, programOptions) => {
  const isJsonOutput = programOptions && typeof programOptions.json === 'boolean'
      ? programOptions.json
      : process.argv.includes('--json');

  if (error.response) {
    const errorData = error.response.data?.error || {
      message: error.response.statusText || 'Unknown server error',
    };
    const correlationId = error.response.headers?.['x-correlation-id'];

    if (isJsonOutput) {
      console.error(
        JSON.stringify(
          {
            error: {
              status: error.response.status,
              message: errorData.message,
              type: errorData.type,
              code: errorData.code,
              correlationId: correlationId || errorData.correlationId, // Prefer header
              details: errorData.details,
            },
          },
          null,
          2
        )
      );
    } else {
      console.error(`Error: ${error.response.status} - ${errorData.message}`);
      if (errorData.type) console.error(`Type: ${errorData.type}`);
      if (errorData.code) console.error(`Code: ${errorData.code}`);
      if (correlationId || errorData.correlationId)
        console.error(
          `CorrelationId: ${correlationId || errorData.correlationId}`
        );
      if (errorData.details) console.error(`Details: ${errorData.details}`);
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
          {
            error: {
              message: error.message,
              type: 'ClientSetupError',
            },
          },
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

// For interactive commands (chat, query interactive) that use axios directly,
// they will need to pass programOpts to their own handleApiError calls if they
// want to use a more robust way of checking --json.
// However, the global apiClient methods below will use the process.argv check.

const apiClient = {
  get: (url, params) =>
    axios.get(`${API_URL}${url}`, { params }).catch(handleApiError),
  post: (url, data) =>
    axios.post(`${API_URL}${url}`, data).catch(handleApiError),
  put: (url, data) =>
    axios.put(`${API_URL}${url}`, data).catch(handleApiError),
  delete: (url) => axios.delete(`${API_URL}${url}`).catch(handleApiError),
};

module.exports = {
  handleApiError, // Exporting this is still useful for commands that call it directly
  apiClient,
  API_BASE_URL: API_URL,
};
