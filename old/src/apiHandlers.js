// This file is intentionally left almost empty as its contents have been moved
// to individual handler files under src/handlers/
// It's kept to avoid breaking imports in tests or other files temporarily,
// but should ideally be removed or replaced by direct imports from src/handlers/*.js
//
// The ApiHandlers object below is now empty.
// All required modules like SessionManager, LlmService, etc., and helper
// functions like validateNonEmptyString are now imported directly within
// the new handler files (e.g., src/handlers/sessionHandlers.js).

const ApiHandlers = {
  // All handlers (getRoot, createSession, getSession, deleteSession, assertAsync,
  // queryAsync, translateNlToRulesAsync, translateRulesToNlAsync, addOntology,
  // updateOntology, getOntologies, getOntology, deleteOntology, explainQueryAsync,
  // getPrompts, debugFormatPromptAsync, _simplifyPrologResults)
  // have been moved to their respective files in the src/handlers/ directory.
};

module.exports = ApiHandlers;
