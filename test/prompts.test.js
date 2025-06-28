const PROMPT_TEMPLATES = require('../src/prompts');

describe('Prompt Templates (src/prompts.js)', () => {
    test('should export an object', () => {
        expect(PROMPT_TEMPLATES).toBeInstanceOf(Object);
    });

    test('should not be an empty object', () => {
        expect(Object.keys(PROMPT_TEMPLATES).length).toBeGreaterThan(0);
    });

    const expectedPromptKeys = [
        'NL_TO_RULES_SYSTEM_PROMPT',
        'NL_TO_RULES_USER_PROMPT',
        'QUERY_TO_PROLOG_SYSTEM_PROMPT',
        'QUERY_TO_PROLOG_USER_PROMPT',
        'RESULT_TO_NL_SYSTEM_PROMPT',
        'RESULT_TO_NL_USER_PROMPT',
        'RULES_TO_NL_SYSTEM_PROMPT',
        'RULES_TO_NL_USER_PROMPT',
        'EXPLAIN_QUERY_SYSTEM_PROMPT',
        'EXPLAIN_QUERY_USER_PROMPT',
        'GENERAL_SYSTEM_INSTRUCTIONS'
    ];

    test(`should contain all expected prompt keys: ${expectedPromptKeys.join(', ')}`, () => {
        expectedPromptKeys.forEach(key => {
            expect(PROMPT_TEMPLATES).toHaveProperty(key);
        });
    });

    describe('Individual Prompt Template Checks', () => {
        for (const key in PROMPT_TEMPLATES) {
            if (Object.prototype.hasOwnProperty.call(PROMPT_TEMPLATES, key)) {
                test(`Template '${key}' should be a non-empty string`, () => {
                    expect(typeof PROMPT_TEMPLATES[key]).toBe('string');
                    expect(PROMPT_TEMPLATES[key].trim()).not.toBe('');
                });

                test(`Template '${key}' should not contain common placeholder errors like "[object Object]"`, () => {
                    expect(PROMPT_TEMPLATES[key]).not.toContain('[object Object]');
                });
            }
        }
    });
});
