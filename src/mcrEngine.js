class MCREngine {
  constructor() {
    require('dotenv').config();
    try {
      // Basic validation, will be expanded
      if (!process.env.LLM_PROVIDER) {
        throw new Error('LLM_PROVIDER is not set in the environment variables.');
      }
    } catch (error) {
      console.error('Failed to initialize MCREngine configuration:', error);
      throw error; // Re-throw to prevent engine from running in a bad state
    }
  }
}

module.exports = MCREngine;
