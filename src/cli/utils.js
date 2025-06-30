/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

/**
 * Reads the content of a specified file.
 * Exits the process if the file is not found.
 * @param {string} filePath - The path to the file.
 * @param {string} fileDescription - A description of the file type (e.g., "Ontology file", "Rules file").
 * @returns {string} The content of the file.
 */
const readFileContent = (filePath, fileDescription = 'File') => {
  // filePath null/undefined check should be done by caller if path is optional
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`Error: ${fileDescription} not found: ${resolvedPath}`);
    process.exit(1);
  }
  return fs.readFileSync(resolvedPath, 'utf8');
};

const readOntologyFile = (filePath) => {
  if (!filePath) return null; // Handles cases where ontology file is optional
  // If filePath is provided, it's expected to exist by readFileContent
  return readFileContent(filePath, 'Ontology file');
};

/**
 * Prints data to the console. If isRawJson is true, it prints the full JSON.
 * Otherwise, it prints a formatted JSON string.
 * @param {*} data The data to print.
 * @param {boolean} isRawJson If true, print non-pretty JSON. Otherwise, pretty print.
 */
const printJson = (data, isRawJson = false) => {
  if (isRawJson) {
    console.log(JSON.stringify(data));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
};

/**
 * Handles CLI output, printing either a custom message or JSON data.
 * @param {*} data - The full data object from the API response.
 * @param {object} cliOptions - Commander options object (e.g., program.opts() or command.opts()).
 * @param {string} [messageKey] - Optional key to extract a simple message from data (e.g., 'message' or 'answer').
 * @param {string} [defaultMessagePrefix] - Optional prefix for the simple message.
 */
const handleCliOutput = (
  data,
  cliOptions,
  messageKey,
  defaultMessagePrefix = ''
) => {
  if (cliOptions.json) {
    printJson(data, true); // Print raw JSON if --json is used
  } else if (messageKey && data && typeof data[messageKey] === 'string') {
    console.log(`${defaultMessagePrefix}${data[messageKey]}`);
  } else if (typeof data === 'string') {
    // Fallback for direct string messages
    console.log(`${defaultMessagePrefix}${data}`);
  } else {
    // Default to pretty printing the JSON data if no simple message format is suitable
    // or if data isn't the simple string expected.
    if (defaultMessagePrefix) console.log(defaultMessagePrefix);
    printJson(data);
  }
};

/**
 * A simple promise-based delay function.
 * @param {number} ms - The number of milliseconds to delay.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  readFileContent, // Added
  readOntologyFile,
  printJson,
  handleCliOutput,
  delay, // Export the new delay function
};
