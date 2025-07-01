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
    console.error(
      `Suggestion: Please ensure the file path is correct and the file exists at that location.`
    );
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
    // Special handling for 'rules' field if it's a string, to make Prolog more readable
    if (
      typeof data === 'object' &&
      data !== null &&
      typeof data.rules === 'string' &&
      data.rules.includes('\n')
    ) {
      const { rules, ...restOfData } = data;
      // Print the rest of the data normally, if there's anything else
      if (Object.keys(restOfData).length > 0) {
        console.log(JSON.stringify(restOfData, null, 2));
      }
      // Print the rules, formatted line by line
      // Check if restOfData was empty, if so, we might not need the "rules:" header if it's the only field.
      // However, for consistency with other parts of the object, let's keep it.
      const rulesLabel =
        Object.keys(restOfData).length > 0 ? '  rules:' : 'rules:';
      console.log(rulesLabel);
      rules.split('\n').forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine.length > 0) {
          // Basic indentation for each line of Prolog code
          console.log(`    ${trimmedLine}`);
        }
      });
    } else {
      // Default behavior for other data types or if 'rules' is not a multi-line string
      console.log(JSON.stringify(data, null, 2));
    }
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

/**
 * Reads file content safely for TUI.
 * Instead of exiting, it uses the addMessage callback to report errors.
 * @param {string} filePath - The path to the file.
 * @param {function} addMessageCallback - Callback function (type, text) to add messages to TUI.
 * @param {string} fileDescription - A description of the file type.
 * @returns {string|null} The content of the file, or null if an error occurs.
 */
const readFileContentSafe = (
  filePath,
  addMessageCallback,
  fileDescription = 'File'
) => {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      addMessageCallback(
        'error',
        `${fileDescription} not found: ${resolvedPath}. Please ensure the file path is correct.`
      );
      return null;
    }
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    addMessageCallback(
      'error',
      `Error reading ${fileDescription} "${filePath}": ${error.message}. Please check file permissions and path.`
    );
    return null;
  }
};

module.exports = {
  readFileContent,
  readOntologyFile,
  printJson,
  handleCliOutput,
  delay, // Export the new delay function
  readFileContentSafe, // Export new safe reader for TUI
  parseTuiCommandArgs, // Exported TUI arg parser
};

// Helper to parse simple command line options like --option value
// For TUI internal commands, not a full CLI parser.
// Moved from chatCommand.js
function parseTuiCommandArgs(args) {
  const options = {};
  const remainingArgs = [];
  let currentOption = null;

  for (const arg of args) {
    if (arg.startsWith('--')) {
      currentOption = arg.substring(2);
      options[currentOption] = true; // Default to true if it's a flag
    } else if (currentOption) {
      options[currentOption] = arg;
      currentOption = null;
    } else {
      remainingArgs.push(arg);
    }
  }
  return { options, _: remainingArgs };
}
