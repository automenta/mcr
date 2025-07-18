const fs = require('fs');
const path = require('path');

let logFilePath = null;
let currentLevel = 'info';

function configureLogger(options = {}) {
    currentLevel = options.logLevel || 'info';
    if (options.logFile) {
        logFilePath = path.resolve(options.logFile);
    } else {
        logFilePath = null;
    }
}

const levels = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
};

const log = (level, message, ...args) => {
  if (levels[level] <= levels[currentLevel]) {
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
  }
};

const logger = {
  info: (message, ...args) => log('info', message, ...args),
  warn: (message, ...args) => log('warn', message, ...args),
  error: (message, ...args) => log('error', message, ...args),
  debug: (message, ...args) => log('debug', message, ...args),
  configure: configureLogger,
};

module.exports = logger;
