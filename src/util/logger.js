const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

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
	http: 3,
	debug: 4,
};

const colors = {
	error: chalk.red,
	warn: chalk.yellow,
	info: chalk.blue,
	http: chalk.magenta,
	debug: chalk.gray,
};

const log = (level, message, ...args) => {
	if (levels[level] <= levels[currentLevel]) {
		const timestamp = new Date().toISOString();
		const levelUpper = level.toUpperCase();
		const color = colors[level] || (text => text);

		// Prepare console message with colors
		const consoleMessage = `${chalk.gray(timestamp)} ${color(
			`[${levelUpper}]`
		)} ${message} ${
			args.length > 0 ? chalk.cyan(JSON.stringify(args, null, 2)) : ''
		}`;
		console.log(consoleMessage);

		// Prepare file message without colors
		const fileMessage = `${timestamp} [${levelUpper}] ${message} ${
			args.length > 0 ? JSON.stringify(args) : ''
		}\n`;

		if (logFilePath) {
			fs.appendFile(logFilePath, fileMessage, err => {
				if (err) {
					console.error(
						chalk.red('Failed to write to log file:'),
						err
					);
				}
			});
		}
	}
};

const logger = {
	error: (message, ...args) => log('error', message, ...args),
	warn: (message, ...args) => log('warn', message, ...args),
	info: (message, ...args) => log('info', message, ...args),
	http: (message, ...args) => log('http', message, ...args),
	debug: (message, ...args) => log('debug', message, ...args),
	configure: configureLogger,
};

module.exports = logger;
