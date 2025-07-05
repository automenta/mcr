// Adapted from old/src/demo.js

const demoLogger = {
  heading: (text) => console.log(`\n🚀 \x1b[1m\x1b[34m${text}\x1b[0m`), // Bold Blue
  step: (text) => console.log(`\n➡️  \x1b[1m${text}\x1b[0m`), // Bold
  info: (label, data) =>
    console.log(
      `   \x1b[36m${label}:\x1b[0m ${typeof data === 'object' ? JSON.stringify(data, null, 2) : data}`
    ), // Cyan label
  nl: (label, text) => console.log(`   🗣️ \x1b[33m${label}:\x1b[0m "${text}"`), // Yellow NL
  logic: (label, text) =>
    console.log(
      `   🧠 \x1b[35m${label}:\x1b[0m ${typeof text === 'object' ? JSON.stringify(text) : text}`
    ), // Magenta Logic
  mcrResponse: (label, text) =>
    console.log(`   🤖 \x1b[32m${label}:\x1b[0m ${text}`), // Green MCR
  success: (text) => console.log(`   ✅ \x1b[32m${text}\x1b[0m`), // Green
  error: (text, details) => {
    console.error(`   ❌ \x1b[31mError: ${text}\x1b[0m`); // Red
    if (details) {
      const detailString =
        typeof details === 'object'
          ? JSON.stringify(details, null, 2)
          : String(details);
      // Ensure details are not excessively long for console output
      const maxDetailLength = 500;
      console.error(
        `      \x1b[90mDetails: ${detailString.substring(0, maxDetailLength)}${detailString.length > maxDetailLength ? '...' : ''}\x1b[0m`
      );
    }
  },
  cleanup: (text) => console.log(`   🧹 \x1b[90m${text}\x1b[0m`), // Dim/Gray
  divider: () => console.log('\n' + '-'.repeat(60)),
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fs = require('fs'); // For readFileContentSafe
const path = require('path'); // For readFileContentSafe

/**
 * Reads file content safely for demos.
 * Instead of exiting, it uses the demoLogger to report errors.
 * @param {string} filePath - The path to the file.
 * @param {string} fileDescription - A description of the file type.
 * @returns {string|null} The content of the file, or null if an error occurs.
 */
const readFileContentSafe = (filePath, fileDescription = 'File') => {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      demoLogger.error(
        `${fileDescription} not found: ${resolvedPath}`,
        'Please ensure the file path is correct and the file exists at that location.'
      );
      return null;
    }
    return fs.readFileSync(resolvedPath, 'utf8');
  } catch (error) {
    demoLogger.error(
      `Error reading ${fileDescription} "${filePath}"`,
      error.message
    );
    return null;
  }
};

module.exports = {
  demoLogger,
  delay,
  readFileContentSafe,
};
