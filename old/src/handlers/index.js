const sessionHandlers = require('./sessionHandlers');
const ontologyHandlers = require('./ontologyHandlers');
const translationHandlers = require('./translationHandlers');
const queryHandlers = require('./queryHandlers');
const utilityHandlers = require('./utilityHandlers');

module.exports = {
  ...sessionHandlers,
  ...ontologyHandlers,
  ...translationHandlers,
  ...queryHandlers,
  ...utilityHandlers,
};
