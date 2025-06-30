const LlmService = require('../llmService');
const ApiError = require('../errors');
const {
  validateNonEmptyString,
  validateOptionalString,
  validateStyle,
} = require('./handlerUtils');

const translationHandlers = {
  translateNlToRulesAsync: async (req, res, next) => {
    try {
      const { text, existing_facts, ontology_context } = req.body;
      validateNonEmptyString(text, 'text', 'NL_TO_RULES');
      validateOptionalString(existing_facts, 'existing_facts', 'NL_TO_RULES');
      validateOptionalString(
        ontology_context,
        'ontology_context',
        'NL_TO_RULES'
      );

      const rules = await LlmService.nlToRulesAsync(
        text,
        existing_facts || '',
        ontology_context || ''
      );
      res.json({ rules });
    } catch (err) {
      next(err);
    }
  },

  translateRulesToNlAsync: async (req, res, next) => {
    try {
      const { rules, style } = req.body;
      if (
        !rules ||
        !Array.isArray(rules) ||
        !rules.every((r) => typeof r === 'string' && r.trim() !== '')
      ) {
        throw new ApiError(
          400,
          "Missing or invalid 'rules' field; must be an array of non-empty strings.",
          'RULES_TO_NL_INVALID_RULES'
        );
      }
      if (style) {
        validateStyle(style, 'style', 'RULES_TO_NL');
      }
      const text = await LlmService.rulesToNlAsync(rules, style);
      res.json({ text });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = translationHandlers;
