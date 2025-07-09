// new/src/logger.js
const winston = require('winston');
const config = require('./config');

const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'mcr-streamlined' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          (info) =>
            `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\\n' + info.stack : ''}`
        )
      ),
    }),
  ],
});

// If in production, might want to add a file transport
// if (process.env.NODE_ENV === 'production') {
//   logger.add(new winston.transports.File({ filename: 'error.log', level: 'error' }));
//   logger.add(new winston.transports.File({ filename: 'combined.log' }));
// }

module.exports = logger;
