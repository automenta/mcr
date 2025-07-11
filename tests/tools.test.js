const mcrToolDefinitions = require('../src/tools');

describe('MCR Tool Definitions (src/tools.js)', () => {
  it('should be an object', () => {
    expect(typeof mcrToolDefinitions).toBe('object');
    expect(mcrToolDefinitions).not.toBeNull();
  });

  const coreToolsToTest = [
    'session.create',
    'session.get',
    'session.delete',
    'session.assert',
    'session.query',
    'session.explainQuery',
    'session.assert_rules',
    'ontology.create',
    'ontology.list',
    'ontology.get',
    'ontology.update',
    'ontology.delete',
    'translate.nlToRules',
    'translate.rulesToNl',
    'strategy.list',
    'strategy.setActive',
    'strategy.getActive',
    'utility.getPrompts',
    'utility.debugFormatPrompt',
    'analysis.get_strategy_leaderboard',
    'analysis.get_strategy_details',
    'analysis.list_eval_curricula',
    'analysis.get_curriculum_details',
    'evolution.start_optimizer',
    'evolution.get_status',
    'evolution.stop_optimizer',
    'evolution.get_optimizer_log',
    'demo.list',
    'demo.run',
  ];

  coreToolsToTest.forEach(toolName => {
    describe(`Tool: ${toolName}`, () => {
      it('should exist in mcrToolDefinitions', () => {
        expect(mcrToolDefinitions[toolName]).toBeDefined();
      });

      it('should have a non-empty description string', () => {
        expect(typeof mcrToolDefinitions[toolName]?.description).toBe('string');
        expect(mcrToolDefinitions[toolName]?.description.length).toBeGreaterThan(0);
      });

      it('should have a handler function', () => {
        expect(typeof mcrToolDefinitions[toolName]?.handler).toBe('function');
      });
    });
  });

  // Optionally, add more specific tests for certain tool schemas if they are complex
  // For example, checking input_schema or output_schema if those were part of mcrToolDefinitions
  // (They are defined in mcrHandler.js for MCP, not directly in mcrToolDefinitions from src/tools.js)

  it('should not have undefined handlers for any defined tool', () => {
    for (const toolName in mcrToolDefinitions) {
      if (Object.prototype.hasOwnProperty.call(mcrToolDefinitions, toolName)) {
        expect(mcrToolDefinitions[toolName]).toBeDefined();
        expect(mcrToolDefinitions[toolName].description).toBeDefined();
        expect(typeof mcrToolDefinitions[toolName].description).toBe('string');
        expect(mcrToolDefinitions[toolName].handler).toBeDefined();
        expect(typeof mcrToolDefinitions[toolName].handler).toBe('function');
      }
    }
  });
});
