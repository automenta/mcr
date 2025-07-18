const fs = require('fs');
const path = require('path');
const config = require('../config');

const logFilePath = config.logFile ? path.resolve(config.logFile) : null;

const log = (level, message, ...args) => {
  const timestamp = new Date().toISOString();
  const formattedMessage = `${timestamp} [${level.toUpperCase()}] ${message} ${args.length > 0 ? JSON.stringify(args) : ''}\n`;

  // Always log to console
  console.log(formattedMessage);

  // Optionally log to file
  if (logFilePath) {
    fs.appendFile(logFilePath, formattedMessage, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
  }
};

const logger = {
  info: (message, ...args) => log('info', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  error: (message, ...args) => log('error', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args),
};

module.exports = logger;
