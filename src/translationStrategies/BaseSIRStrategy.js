// src/translationStrategies/BaseSIRStrategy.js
const logger = require('../logger');
const { prompts, fillTemplate } = require('../prompts'); // Assuming prompts are accessible

/**
 * @class BaseSIRStrategy
 * Abstract base class for Structured Intermediate Representation (SIR) strategies.
 * It provides common SIR to Prolog conversion logic and a structure for subclasses.
 * Subclasses should implement `getName()` and provide their specific prompts for
 * `assert` and `query` methods by overriding `getAssertPrompts` and `getQueryPrompts`.
 */
class BaseSIRStrategy {
  constructor() {
    if (this.constructor === BaseSIRStrategy) {
      throw new TypeError('Abstract class "BaseSIRStrategy" cannot be instantiated directly.');
    }
  }

  /**
   * Gets the unique name of the strategy.
   * This method MUST be implemented by subclasses.
   * @returns {string} The unique name of the strategy.
   */
  getName() {
    throw new Error("Method 'getName()' must be implemented by subclasses.");
  }

  /**
   * Returns the system and user prompt templates for SIR generation during assertion.
   * Subclasses should override this to provide their specific prompts.
   * @returns {{system: string, user: string}} An object containing system and user prompt templates.
   */
  getAssertPrompts() {
    // Default to a generic SIR assert prompt if not overridden,
    // though subclasses are expected to provide their own.
    logger.warn(`[BaseSIRStrategy] getAssertPrompts() not overridden by ${this.getName()}, using default NL_TO_SIR_ASSERT.`);
    return prompts.NL_TO_SIR_ASSERT;
  }

  /**
   * Returns the system and user prompt templates for query generation.
   * Subclasses should override this to provide their specific prompts for NL to Prolog query.
   * @returns {{system: string, user: string}} An object containing system and user prompt templates.
   */
  getQueryPrompts() {
    // Default to a generic NL_TO_QUERY prompt if not overridden.
    logger.warn(`[BaseSIRStrategy] getQueryPrompts() not overridden by ${this.getName()}, using default NL_TO_QUERY.`);
    return prompts.NL_TO_QUERY;
  }


  /**
   * Converts a validated SIR JSON object (or array of objects for facts) into Prolog clauses.
   * This can be overridden by subclasses if their SIR structure is significantly different.
   * @param {object | object[]} sirJson - The SIR JSON data.
   * @returns {string[]} An array of Prolog clause strings.
   * @throws {Error} If the SIR JSON structure is invalid.
   */
  _convertSirToProlog(sirJson) {
    const clauses = [];

    const formatTerm = (term) => {
      if (!term || typeof term.predicate !== 'string' || !Array.isArray(term.arguments)) {
        throw new Error(`Invalid term structure in SIR JSON: ${JSON.stringify(term)}`);
      }
      let predicateToFormat = term.predicate;
      if (!/^[a-z_][a-zA-Z0-9_]*$/.test(predicateToFormat)) {
        predicateToFormat = `'${predicateToFormat.replace(/'/g, "''")}'`;
      }

      const formatArgument = (arg) => {
        if (Array.isArray(arg)) {
          const formattedListArgs = arg.map(formatArgument).join(',');
          return `[${formattedListArgs}]`;
        }
        if (typeof arg === 'number') { // Allow numbers directly
            return arg.toString();
        }
        if (typeof arg !== 'string') {
          throw new Error(`Argument is not a string, number or array: ${JSON.stringify(arg)}`);
        }
        if (arg.match(/^[A-Z_][a-zA-Z0-9_]*$/)) return arg; // Variable
        if (arg.match(/^-?\d+(\.\d+)?$/) && !isNaN(parseFloat(arg))) return arg; // Number as string
        if (arg.match(/^[a-z_][a-zA-Z0-9_]*$/)) return arg; // Simple atom

        const escapedArg = arg.replace(/'/g, "''");
        return `'${escapedArg}'`;
      };

      const formattedArgs = term.arguments.map(formatArgument);
      return `${predicateToFormat}(${formattedArgs.join(',')})`;
    };

    const processSingleSirItem = (item) => {
      if (item.statementType === 'fact' && item.fact) {
        let clause = formatTerm(item.fact);
        if (item.fact.isNegative) {
          clause = `not(${clause})`;
        }
        clauses.push(`${clause}.`);
      } else if (item.statementType === 'rule' && item.rule && item.rule.head && Array.isArray(item.rule.body)) {
        const headStr = formatTerm(item.rule.head);
        if (item.rule.body.length === 0) {
          clauses.push(`${headStr}.`);
        } else {
          const bodyStr = item.rule.body
            .map((bodyTerm) => {
              let term = formatTerm(bodyTerm);
              if (bodyTerm.isNegative) {
                term = `not(${term})`;
              }
              return term;
            })
            .join(', ');
          clauses.push(`${headStr} :- ${bodyStr}.`);
        }
      } else {
        logger.warn(`[${this.getName()}] Invalid SIR structure for item: ${JSON.stringify(item)}`);
        // Optionally throw new Error for stricter parsing. For now, skipping invalid items.
      }
    };

    if (Array.isArray(sirJson)) {
      sirJson.forEach(processSingleSirItem);
    } else if (typeof sirJson === 'object' && sirJson !== null && sirJson.statementType) {
      processSingleSirItem(sirJson);
    } else {
      throw new Error(`Unexpected SIR JSON format. Expected object or array of objects. Received: ${JSON.stringify(sirJson)}`);
    }
    return clauses;
  }

  /**
   * Translates natural language text into an array of symbolic clauses (facts or rules) via SIR.
   * @async
   * @param {string} naturalLanguageText - The natural language text to be asserted.
   * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
   * @param {object} [options] - Optional parameters for the assertion.
   * @param {string} [options.existingFacts=""] - Optional string of existing facts for context.
   * @param {string} [options.ontologyRules=""] - Optional string of ontology rules for context.
   * @param {string} [options.lexiconSummary="No lexicon summary available."] - Optional lexicon summary.
   * @returns {Promise<string[]>} A promise that resolves to an array of string-based Prolog clauses.
   * @throws {Error} If translation or SIR processing fails.
   */
  async assert(naturalLanguageText, llmProvider, options = {}) {
    const {
      existingFacts = '',
      ontologyRules = '',
      lexiconSummary = 'No lexicon summary available.',
    } = options;
    logger.debug(`[${this.getName()}] Asserting NL via SIR: "${naturalLanguageText}". Lexicon: ${lexiconSummary.substring(0,100)}...`);

    const assertPrompts = this.getAssertPrompts();
    if (!assertPrompts || !assertPrompts.system || !assertPrompts.user) {
        throw new Error(`[${this.getName()}] Invalid assert prompts defined.`);
    }

    const sirPromptUser = fillTemplate(assertPrompts.user, {
      naturalLanguageText,
      existingFacts,
      ontologyRules,
      lexiconSummary,
    });

    const llmJsonOutput = await llmProvider.generate(assertPrompts.system, sirPromptUser);
    logger.debug(`[${this.getName()}] LLM Raw JSON Output for assert: \n${llmJsonOutput}`);

    let sirJson;
    try {
      const jsonMatch = llmJsonOutput.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])|({[\s\S]*})/);
      if (!jsonMatch) {
        throw new Error('No valid JSON object or array found in the LLM response.');
      }
      const extractedJson = jsonMatch[1] || jsonMatch[2] || jsonMatch[3];
      sirJson = JSON.parse(extractedJson);
    } catch (e) {
      logger.error(`[${this.getName()}] Failed to parse SIR JSON from LLM response. Error: ${e.message}. Response: ${llmJsonOutput}`);
      throw new Error(`LLM output was not valid JSON: ${e.message}`);
    }

    // Basic validation for error field or expected structure (can be expanded)
    if (sirJson.error) {
      logger.warn(`[${this.getName()}] LLM indicated an error with the input for SIR generation: ${sirJson.error}`);
      throw new Error(`LLM reported error for SIR generation: ${sirJson.error}`);
    }
     // More specific validation for common SIR structures
    const isValidSir = (item) => item.statementType && ((item.statementType === 'fact' && item.fact) || (item.statementType === 'rule' && item.rule));
    const checkSir = Array.isArray(sirJson) ? sirJson.every(isValidSir) : isValidSir(sirJson);

    if (!checkSir) {
        logger.error(`[${this.getName()}] Invalid SIR JSON structure after parsing: ${JSON.stringify(sirJson)}`);
        throw new Error('LLM output did not conform to the expected SIR JSON structure.');
    }


    const prologClauses = this._convertSirToProlog(sirJson);
    if (prologClauses.length === 0 && naturalLanguageText.trim() !== "") { // only throw if input was not empty
      logger.warn(`[${this.getName()}] No Prolog clauses generated from SIR for text: "${naturalLanguageText}"`);
      throw new Error('Could not translate text into valid Prolog clauses via SIR (no clauses generated).');
    }
    logger.info(`[${this.getName()}] Translated to Prolog via SIR: ${JSON.stringify(prologClauses)}`);
    return prologClauses;
  }

  /**
   * Translates a natural language question into a symbolic query string.
   * @async
   * @param {string} naturalLanguageQuestion - The natural language question.
   * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
   * @param {object} [options] - Optional parameters for the query translation.
   * @param {string} [options.existingFacts=""] - Optional string of existing facts for context.
   * @param {string} [options.ontologyRules=""] - Optional string of ontology rules for context.
   * @param {string} [options.lexiconSummary="No lexicon summary available."] - Optional lexicon summary.
   * @returns {Promise<string>} A promise that resolves to a string representing the Prolog query.
   * @throws {Error} If translation fails or the generated query is invalid.
   */
  async query(naturalLanguageQuestion, llmProvider, options = {}) {
    const {
      existingFacts = '',
      ontologyRules = '',
      lexiconSummary = 'No lexicon summary available.',
    } = options;
    logger.debug(`[${this.getName()}] Translating NL query: "${naturalLanguageQuestion}". Lexicon: ${lexiconSummary.substring(0,100)}...`);

    const queryPrompts = this.getQueryPrompts();
     if (!queryPrompts || !queryPrompts.system || !queryPrompts.user) {
        throw new Error(`[${this.getName()}] Invalid query prompts defined.`);
    }

    const nlToQueryPromptUser = fillTemplate(queryPrompts.user, {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules,
      lexiconSummary,
    });

    const prologQuery = await llmProvider.generate(queryPrompts.system, nlToQueryPromptUser);
    logger.debug(`[${this.getName()}] LLM Raw Output for query: ${prologQuery}`);

    let cleanedQuery = prologQuery.trim();
    if (cleanedQuery.startsWith('?-')) {
      cleanedQuery = cleanedQuery.substring(2).trim();
    }
    cleanedQuery = cleanedQuery.replace(/\.+$/, '').trim(); // Remove all trailing periods

    if (cleanedQuery) {
      cleanedQuery += '.'; // Add one period back
    } else {
      logger.error(`[${this.getName()}] LLM generated empty Prolog query after cleaning: "${prologQuery}"`);
      throw new Error('Failed to translate question to a valid Prolog query (empty after cleaning).');
    }

    // Basic validation
    const isSimpleAtomQuery = /^[a-z_][a-zA-Z0-9_]*\.$/.test(cleanedQuery);
    const isComplexQuery = /^[a-z_'][a-zA-Z0-9_,'()\[\]]*\(.*\)\.$/.test(cleanedQuery); // More permissive for lists, quoted atoms

    if (!isSimpleAtomQuery && !isComplexQuery && cleanedQuery !== 'true.' && cleanedQuery !== 'fail.') {
        logger.warn(`[${this.getName()}] Generated query "${cleanedQuery}" might be malformed (heuristic check).`);
    }

    if (!cleanedQuery.endsWith('.')) { // Should always end with a period if not empty
        logger.error(`[${this.getName()}] LLM generated invalid Prolog query after final processing: "${cleanedQuery}" (Original: "${prologQuery}")`);
        throw new Error('Failed to translate question to a valid query (malformed or missing period).');
    }

    logger.info(`[${this.getName()}] Translated to Prolog query: ${cleanedQuery}`);
    return cleanedQuery;
  }
}

module.exports = BaseSIRStrategy;
