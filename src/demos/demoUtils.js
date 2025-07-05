// Adapted from old/src/demo.js
const chalk = require('chalk');

const demoLogger = {
  heading: (text) => console.log(`\n🚀 ${chalk.bold.blue(text)}`),
  step: (text) => console.log(`\n➡️  ${chalk.bold(text)}`),
  info: (label, data) => {
    const dataString = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    console.log(`   ${chalk.cyan(label)}: ${dataString}`);
  },
  nl: (label, text) => console.log(`   🗣️ ${chalk.yellow(label)}: "${text}"`),
  logic: (label, text) => {
    const textString = typeof text === 'object' ? JSON.stringify(text) : text;
    console.log(`   🧠 ${chalk.magenta(label)}: ${textString}`);
  },
  apiCall: (method, url, body = null) => {
    let logString = `   📞 ${chalk.bold.yellow(method.toUpperCase())} ${chalk.underline.yellow(url)}`;
    if (body) {
      // For bodies that might be very large (like ontology text), truncate them.
      let bodyStr = JSON.stringify(body, null, 2);
      if (bodyStr.length > 500) {
        bodyStr = bodyStr.substring(0, 497) + '...';
      }
      logString += `\n     ${chalk.gray('Body:')} ${chalk.gray(bodyStr)}`;
    }
    console.log(logString);
  },
  mcrResponse: (label, text) => console.log(`   🤖 ${chalk.green(label)}: ${text}`),
  success: (text) => console.log(`   ✅ ${chalk.green(text)}`),
  error: (text, details) => {
    console.error(`   ❌ ${chalk.red.bold('Error:')} ${chalk.red(text)}`);
    if (details) {
      const detailString =
        typeof details === 'object'
          ? JSON.stringify(details, null, 2)
          : String(details);
      const maxDetailLength = 1000; // Increased max length
      console.error(
        `      ${chalk.dim('Details:')} ${chalk.gray(detailString.substring(0, maxDetailLength))}${detailString.length > maxDetailLength ? chalk.gray('... (truncated)') : ''}`
      );
    }
  },
  assertion: (status, message) => {
    if (status) {
      console.log(`   👍 ${chalk.bold.green('ASSERT OK:')} ${chalk.green(message)}`);
    } else {
      console.log(`   👎 ${chalk.bold.red('ASSERT FAIL:')} ${chalk.red(message)}`);
    }
  },
  cleanup: (text) => console.log(`   🧹 ${chalk.dim(text)}`), // Dim/Gray
  divider: (char = '-', length = 60) => console.log('\n' + chalk.gray(char.repeat(length))),
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
