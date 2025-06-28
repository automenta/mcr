/* eslint-disable no-console */
const axios = require('axios');

const API_BASE_URL = process.env.MCR_API_URL || 'http://localhost:8080';

const handleApiError = (error) => {
  if (error.response) {
    const message = error.response.data?.error?.message || error.response.statusText;
    const details = error.response.data?.error?.details;
    console.error(`Error: ${error.response.status} - ${message}`);
    if (details) {
      console.error(`Details: ${details}`);
    }
  } else if (error.request) {
    console.error(`Error: No response received from MCR API at ${API_BASE_URL}. Is the server running?`);
  } else {
    console.error(`Error: ${error.message}`);
  }
  process.exit(1);
};

const apiClient = {
  get: (url, params) => axios.get(`${API_BASE_URL}${url}`, { params }).catch(handleApiError),
  post: (url, data) => axios.post(`${API_BASE_URL}${url}`, data).catch(handleApiError),
  put: (url, data) => axios.put(`${API_BASE_URL}${url}`, data).catch(handleApiError),
  delete: (url) => axios.delete(`${API_BASE_URL}${url}`).catch(handleApiError),
};

module.exports = {
  handleApiError,
  apiClient,
  API_BASE_URL, // Export for use in interactive commands if needed
};
