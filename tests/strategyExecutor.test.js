// tests/strategyExecutor.test.js
const StrategyExecutor = require('../src/strategyExecutor');
const { MCRError, ErrorCodes } = require('../src/errors');
// const logger = require('../src/logger'); // Unused

// Mock logger to prevent console output during tests
jest.mock('../src/util/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Mock ILlmProvider
const mockLlmProvider = {
  generate: jest.fn(),
};

// Mock IReasonProvider (currently not used by conditional router or LF conversion tests directly)
const mockReasonerProvider = {
  executeQuery: jest.fn(),
  validateKnowledgeBase: jest.fn(),
};

describe('StrategyExecutor', () => {
  describe('Conditional_Router Node', () => {
    it('should route to target if property_exists condition is met', async () => {
      // const strategyJson = { // This was unused, correctedStrategyJson is used below
      //   id: 'test-conditional-route',
      //   name: 'Test Conditional Route',
      //   nodes: [
      //     { id: 'start', type: 'LLM_Call', prompt_text: {user: "test"}, output_variable: 'data' },
      //     {
      //       id: 'router',
      //       type: 'Conditional_Router',
      //       input_variable: 'data',
      //       branches: [
      //         { condition: 'property_exists', property: 'error', target: 'error_handler' },
      //         { condition: 'default', target: 'default_handler' }
      //       ]
      //     },
      //     { id: 'error_handler', type: 'LLM_Call', prompt_text: {user: "error"}, output_variable: 'final_result' },
      //     { id: 'default_handler', type: 'LLM_Call', prompt_text: {user: "default"}, output_variable: 'final_result' }
      //   ],
      //   edges: [
      //     { from: 'start', to: 'router' }
      //     // Edges from router targets are implicit in this test structure for simplicity,
      //     // but in a full graph they would exist to connect error_handler/default_handler to further nodes or define them as endpoints.
      //   ],
      //   result_variable: 'final_result'
      // };

      mockLlmProvider.generate.mockReset(); // Ensure mocks are clean for this test
      mockLlmProvider.generate.mockReset(); // Ensure mocks are clean for this test
      mockLlmProvider.generate.mockResolvedValueOnce({
        text: JSON.stringify({ message: 'data with error', error: true }),
      }); // For 'start' node LLM call
      mockLlmProvider.generate.mockResolvedValueOnce({
        text: 'error_handled_output',
      }); // For 'error_handler' LLM call

      // Corrected strategy definition for the test
      const correctedStrategyJson = {
        id: 'test-conditional-route',
        name: 'Test Conditional Route',
        nodes: [
          {
            id: 'start',
            type: 'LLM_Call',
            prompt_text: { user: 'test' },
            output_variable: 'start_output_raw',
          },
          {
            id: 'parse_start_data',
            type: 'Parse_JSON',
            input_variable: 'start_output_raw',
            output_variable: 'data',
          },
          {
            id: 'router',
            type: 'Conditional_Router',
            input_variable: 'data',
            branches: [
              {
                condition: 'property_exists',
                property: 'error',
                target: 'error_handler',
              },
              { condition: 'default', target: 'default_handler' },
            ],
          },
          {
            id: 'error_handler',
            type: 'LLM_Call',
            prompt_text: { user: 'error' },
            output_variable: 'final_result',
          },
          {
            id: 'default_handler',
            type: 'LLM_Call',
            prompt_text: { user: 'default' },
            output_variable: 'final_result',
          },
        ],
        edges: [
          { from: 'start', to: 'parse_start_data' },
          { from: 'parse_start_data', to: 'router' },
          // Edges from router targets to subsequent nodes would be here in a full graph
        ],
        result_variable: 'final_result',
      };

      const executor = new StrategyExecutor(correctedStrategyJson);
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        {}
      );

      expect(result).toBe('error_handled_output');
      expect(mockLlmProvider.generate).toHaveBeenCalledTimes(2);
      // First call for 'start', second for 'error_handler'
      expect(mockLlmProvider.generate.mock.calls[1][1]).toContain('error'); // Check correct prompt for error_handler
    });

    it('should route to default target if no other condition is met', async () => {
      const strategyJson = {
        id: 'test-conditional-default',
        name: 'Test Conditional Default',
        nodes: [
          {
            id: 'start',
            type: 'LLM_Call',
            prompt_text: { user: 'test' },
            output_variable: 'data_raw',
          },
          {
            id: 'parse_data',
            type: 'Parse_JSON',
            input_variable: 'data_raw',
            output_variable: 'data',
          },
          {
            id: 'router',
            type: 'Conditional_Router',
            input_variable: 'data',
            branches: [
              {
                condition: 'property_exists',
                property: 'error',
                target: 'error_handler',
              },
              { condition: 'default', target: 'default_handler' },
            ],
          },
          {
            id: 'error_handler',
            type: 'LLM_Call',
            prompt_text: { user: 'error' },
            output_variable: 'final_result',
          },
          {
            id: 'default_handler',
            type: 'LLM_Call',
            prompt_text: { user: 'default' },
            output_variable: 'final_result',
          },
        ],
        edges: [
          { from: 'start', to: 'parse_data' },
          { from: 'parse_data', to: 'router' },
        ],
        result_variable: 'final_result',
      };

      mockLlmProvider.generate.mockReset();
      mockLlmProvider.generate.mockResolvedValueOnce({
        text: JSON.stringify({ message: 'data without error' }),
      }); // For 'start' node
      mockLlmProvider.generate.mockResolvedValueOnce({
        text: 'default_handled_output',
      }); // For 'default_handler' node

      const executor = new StrategyExecutor(strategyJson);
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        {}
      );

      expect(result).toBe('default_handled_output');
      expect(mockLlmProvider.generate).toHaveBeenCalledTimes(2);
      expect(mockLlmProvider.generate.mock.calls[1][1]).toContain('default');
    });

    it('should handle missing input_variable for Conditional_Router', async () => {
      const strategyJson = {
        id: 'test-conditional-missing-var',
        name: 'Test Missing Var',
        nodes: [
          {
            id: 'router',
            type: 'Conditional_Router',
            branches: [{ condition: 'default', target: 'end' }],
          },
          {
            id: 'end',
            type: 'LLM_Call',
            prompt_text: { user: 'end' },
            output_variable: 'final_result',
          },
        ],
        edges: [],
        result_variable: 'final_result',
      };
      const executor = new StrategyExecutor(strategyJson);
      await expect(
        executor.execute(mockLlmProvider, mockReasonerProvider, {})
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'MCRError', // MCRError sets its name property to 'MCRError'
          message: expect.stringContaining(
            "Conditional_Router node router missing 'input_variable'."
          ),
          code: ErrorCodes.INVALID_STRATEGY_NODE,
        })
      );
    });
  });

  // Test for convertLfToProlog (internal function, but testable via LF_To_Prolog node)
  // We need to access convertLfToProlog. It's not exported directly.
  // We can test it by creating a strategy that uses the LF_To_Prolog node.
  describe('LF_To_Prolog Node and convertLfToProlog function', () => {
    const baseLfStrategy = {
      id: 'test-lf-conversion',
      name: 'Test LF Conversion',
      nodes: [
        // Simulate data being placed into executionState directly for lf_json_object
        {
          id: 'lf_converter',
          type: 'LF_To_Prolog',
          input_variable: 'lf_input',
          output_variable: 'prolog_output',
        },
      ],
      edges: [],
      result_variable: 'prolog_output',
    };

    it('should convert a simple LF fact to Prolog', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy)); // Deep copy
      const executor = new StrategyExecutor(strategy);
      const lfFact = {
        type: 'fact',
        term: {
          predicate: 'human',
          args: [{ type: 'atom', value: 'socrates' }],
        },
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfFact }
      );
      expect(result).toEqual(['human(socrates).']);
    });

    it('should convert an LF rule to Prolog', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfRule = {
        type: 'rule',
        head: { predicate: 'mortal', args: [{ type: 'variable', name: 'X' }] },
        body: [{ predicate: 'human', args: [{ type: 'variable', name: 'X' }] }],
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfRule }
      );
      expect(result).toEqual(['mortal(X) :- human(X).']);
    });

    it('should convert an LF rule with multiple body goals', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfRule = {
        type: 'rule',
        head: {
          predicate: 'grandfather',
          args: [
            { type: 'variable', name: 'G' },
            { type: 'variable', name: 'C' },
          ],
        },
        body: [
          {
            predicate: 'father',
            args: [
              { type: 'variable', name: 'G' },
              { type: 'variable', name: 'P' },
            ],
          },
          {
            predicate: 'parent',
            args: [
              { type: 'variable', name: 'P' },
              { type: 'variable', name: 'C' },
            ],
          },
        ],
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfRule }
      );
      expect(result).toEqual(['grandfather(G,C) :- father(G,P), parent(P,C).']);
    });

    it('should handle LF atoms needing quotes', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfFact = {
        type: 'fact',
        term: {
          predicate: 'has-prop',
          args: [
            { type: 'atom', value: 'object1' },
            { type: 'atom', value: 'a value with spaces' },
          ],
        },
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfFact }
      );
      expect(result).toEqual(["'has-prop'(object1,'a value with spaces')."]);
    });

    it('should handle lists in LF arguments', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfFact = {
        type: 'fact',
        term: {
          predicate: 'processed',
          args: [
            {
              type: 'list',
              elements: [
                { type: 'atom', value: 'a' },
                { type: 'number', value: 1 },
              ],
            },
          ],
        },
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfFact }
      );
      expect(result).toEqual(['processed([a,1]).']);
    });

    it('should handle nested terms in LF arguments', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfFact = {
        type: 'fact',
        term: {
          predicate: 'relates',
          args: [
            { type: 'atom', value: 'item1' },
            {
              type: 'term',
              value: {
                predicate: 'pair',
                args: [
                  { type: 'number', value: 10 },
                  { type: 'atom', value: 'x' },
                ],
              },
            },
          ],
        },
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfFact }
      );
      expect(result).toEqual(['relates(item1,pair(10,x)).']);
    });

    it('should handle negated terms in LF rule body', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfRule = {
        type: 'rule',
        head: { predicate: 'can_fly', args: [{ type: 'variable', name: 'X' }] },
        body: [
          { predicate: 'bird', args: [{ type: 'variable', name: 'X' }] },
          {
            predicate: 'penguin',
            args: [{ type: 'variable', name: 'X' }],
            isNegative: true,
          },
        ],
      };
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfRule }
      );
      expect(result).toEqual(['can_fly(X) :- bird(X), not(penguin(X)).']);
    });

    it('should throw error for invalid LF structure (e.g. missing type in arg)', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfInvalid = {
        type: 'fact',
        term: { predicate: 'test', args: [{ value: 'baddata' }] },
      }; // Arg missing type
      await expect(
        executor.execute(mockLlmProvider, mockReasonerProvider, {
          lf_input: lfInvalid,
        })
      ).rejects.toThrow(MCRError);
      // Could also check for specific ErrorCodes.INVALID_LF_STRUCTURE if the error object is inspected
    });

    it('should process an array of LF items', async () => {
      const strategy = JSON.parse(JSON.stringify(baseLfStrategy));
      const executor = new StrategyExecutor(strategy);
      const lfArray = [
        {
          type: 'fact',
          term: { predicate: 'p', args: [{ type: 'atom', value: 'a' }] },
        },
        {
          type: 'fact',
          term: { predicate: 'q', args: [{ type: 'atom', value: 'b' }] },
        },
      ];
      const result = await executor.execute(
        mockLlmProvider,
        mockReasonerProvider,
        { lf_input: lfArray }
      );
      expect(result).toEqual(['p(a).', 'q(b).']);
    });
  });
});

// Minimal test for the convertSirToProlog function (already exists and is used)
// This is more of a sanity check as it's pre-existing.
describe('convertSirToProlog (existing function)', () => {
  // strategyExecutor file does not export convertSirToProlog directly
  // We'll test it via a strategy execution like LF_To_Prolog tests
  const baseSirStrategy = {
    id: 'test-sir-conversion',
    name: 'Test SIR Conversion',
    nodes: [
      {
        id: 'sir_converter',
        type: 'SIR_To_Prolog',
        input_variable: 'sir_input',
        output_variable: 'prolog_output',
      },
    ],
    edges: [],
    result_variable: 'prolog_output',
  };

  it('should convert a simple SIR fact', async () => {
    const strategy = JSON.parse(JSON.stringify(baseSirStrategy));
    const executor = new StrategyExecutor(strategy);
    const sirFact = {
      statementType: 'fact',
      fact: { predicate: 'human', arguments: ['socrates'] },
    };
    const result = await executor.execute(
      mockLlmProvider,
      mockReasonerProvider,
      { sir_input: sirFact }
    );
    expect(result).toEqual(['human(socrates).']);
  });
});
