const actualLogger = jest.requireActual('../logger');

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  // Add other levels like 'silly', 'verbose', 'http' if they are used and need mocking
  // For 'fatal', since it's not a standard winston level and we're removing its use,
  // we don't strictly need to mock it here unless some test still tries to call it
  // on a manually mocked logger object somewhere else.
  // If logger.fatal was used, it should be mocked: fatal: jest.fn(),
};

module.exports = {
  logger: mockLogger, // Export 'logger' as the mock object
  reconfigureLogger: jest.fn(),
  initializeLoggerContext: jest.fn((req, res, next) => {
    // If the actual asyncLocalStorage logic is important for some tests,
    // it might need a more sophisticated mock or to use the actual implementation.
    // For now, just make it a mock function that calls next().
    if (next) {
      next();
    }
  }),
  asyncLocalStorage: actualLogger.asyncLocalStorage, // Or mock if needed: new (jest.requireActual('async_hooks').AsyncLocalStorage)(),
};
