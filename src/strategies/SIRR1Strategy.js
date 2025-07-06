// src/strategies/SIRR1Strategy.js

const { prompts, fillTemplate } = require('../prompts');
const logger = require('../logger');

/**
 * @class SIRR1Strategy
 * Implements the ITranslationStrategy convention using a Structured Intermediate Representation (SIR).
 * This strategy translates natural language to a JSON SIR, then deterministically converts
 * that JSON to Prolog. This is designed for robustness against LLM syntax errors.
 */
class SIRR1Strategy {
  /**
   * Gets the unique name of the strategy.
   * @returns {string} The unique name of the strategy.
   */
  getName() {
    return 'SIR-R1';
  }

  /**
   * Converts a validated SIR JSON object (or array of objects for facts) into Prolog clauses.
   * @param {object | object[]} sirJson - The SIR JSON data.
   * @returns {string[]} An array of Prolog clause strings.
   * @throws {Error} If the SIR JSON structure is invalid.
   */
  _convertSirToProlog(sirJson) {
    const clauses = [];

    const formatTerm = (term) => {
      if (
        !term ||
        typeof term.predicate !== 'string' ||
        !Array.isArray(term.arguments)
      ) {
        throw new Error(
          `Invalid term structure in SIR JSON: ${JSON.stringify(term)}`
        );
      }
      // Arguments are expected to be strings. Variables ALL CAPS, constants lowercase.
      // This was handled by the LLM when generating SIR.
      // Predicate names are expected to be valid Prolog atoms (start with lowercase, alphanumeric + underscore)
      // or they need to be quoted by the LLM in the SIR if they contain special chars.
      // We will validate and quote if necessary, but the primary responsibility is on the SIR generation prompt.

      let predicateToFormat = term.predicate;

      // Rule 1: If predicate contains characters other than letters, numbers, or underscore,
      // or if it starts with an uppercase letter or a digit, it MUST be quoted.
      // An unquoted atom must start with a lowercase letter.
      if (!/^[a-z_][a-zA-Z0-9_]*$/.test(predicateToFormat)) {
        predicateToFormat = `'${predicateToFormat.replace(/'/g, "''")}'`;
      }

      // Recursive function to format individual arguments, including lists
      const formatArgument = (arg) => {
        if (Array.isArray(arg)) {
          // Handle list arguments
          const formattedListArgs = arg.map(formatArgument).join(',');
          return `[${formattedListArgs}]`;
        }
        if (typeof arg !== 'string') {
          // This check might now be too restrictive if we allow numbers directly in SIR for arg in the future
          // For now, sticking to string arguments from SIR as per original design, lists are the new structure.
          throw new Error(
            `Argument is not a string or array: ${JSON.stringify(arg)}`
          );
        }

        // Rule 2: Variables (start with Uppercase or _) are not quoted.
        if (arg.match(/^[A-Z_][a-zA-Z0-9_]*$/)) {
          return arg;
        }

        // Rule 3: Numbers are not quoted.
        if (arg.match(/^-?\d+(\.\d+)?$/)) {
          return arg;
        }

        // Rule 4: Check if it's an atom that does NOT require quoting.
        // An unquoted atom starts with a lowercase letter and contains only letters, digits, and underscores.
        if (arg.match(/^[a-z_][a-zA-Z0-9_]*$/)) {
          return arg; // Simple atom, no quoting needed
        }

        // Rule 5: Otherwise, the atom MUST be quoted.
        // This includes atoms with spaces, special characters, starting with uppercase (if not a var), etc.
        // Escape single quotes within the atom name by doubling them.
        const escapedArg = arg.replace(/'/g, "''");
        return `'${escapedArg}'`;
      };

      const formattedArgs = term.arguments.map(formatArgument);

      return `${predicateToFormat}(${formattedArgs.join(',')})`;
    };

    if (Array.isArray(sirJson)) {
      // Expected for multiple facts from one NL text
      for (const item of sirJson) {
        if (item.statementType === 'fact' && item.fact) {
          let clause = formatTerm(item.fact);
          if (item.fact.isNegative) {
            clause = `not(${clause})`;
          }
          clauses.push(`${clause}.`);
        } else {
          logger.warn(
            `[SIRR1Strategy] Expected an array of fact SIR objects, but found: ${JSON.stringify(item)}`
          );
          // Decide on error handling: throw, or skip invalid items
          // For now, skipping invalid items in an array of facts.
        }
      }
    } else if (typeof sirJson === 'object' && sirJson.statementType) {
      // Single object, could be fact or rule
      if (sirJson.statementType === 'fact' && sirJson.fact) {
        let clause = formatTerm(sirJson.fact);
        if (sirJson.fact.isNegative) {
          clause = `not(${clause})`;
        }
        clauses.push(`${clause}.`);
      } else if (
        sirJson.statementType === 'rule' &&
        sirJson.rule &&
        sirJson.rule.head &&
        Array.isArray(sirJson.rule.body)
      ) {
        const headStr = formatTerm(sirJson.rule.head);
        if (sirJson.rule.body.length === 0) {
          // Fact-like rule (e.g. bird(tweety). equivalent)
          clauses.push(`${headStr}.`);
        } else {
          const bodyStr = sirJson.rule.body
            .map((bodyTerm) => {
              let term = formatTerm(bodyTerm);
              if (bodyTerm.isNegative) {
                // Assuming body terms can also be negated
                term = `not(${term})`;
              }
              return term;
            })
            .join(', ');
          clauses.push(`${headStr} :- ${bodyStr}.`);
        }
      } else {
        throw new Error(
          `Invalid SIR JSON structure: ${JSON.stringify(sirJson)}`
        );
      }
    } else {
      throw new Error(
        `Unexpected SIR JSON format. Expected object or array of objects. Received: ${JSON.stringify(sirJson)}`
      );
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
   * @returns {Promise<string[]>} A promise that resolves to an array of string-based Prolog clauses.
   * @throws {Error} If translation or SIR processing fails.
   */
  async assert(naturalLanguageText, llmProvider, options = {}) {
    const {
      existingFacts = '',
      ontologyRules = '',
      lexiconSummary = 'No lexicon summary available.',
    } = options;
    logger.debug(
      `[SIRR1Strategy] Asserting NL via SIR: "${naturalLanguageText}". Lexicon summary: ${lexiconSummary.substring(0, 100)}...`
    );

    const sirPromptUser = fillTemplate(prompts.NL_TO_SIR_ASSERT.user, {
      naturalLanguageText,
      existingFacts,
      ontologyRules,
      lexiconSummary,
    });

    const llmJsonOutput = await llmProvider.generate(
      prompts.NL_TO_SIR_ASSERT.system,
      sirPromptUser
    );
    logger.debug(
      `[SIRR1Strategy] LLM Raw JSON Output for NL_TO_SIR_ASSERT: \n${llmJsonOutput}`
    );

    let sirJson;
    try {
      // Attempt to extract JSON from potential markdown code blocks
      const jsonMatch = llmJsonOutput.match(
        /```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])|({[\s\S]*})/
      );
      if (!jsonMatch) {
        throw new Error(
          'No valid JSON object or array found in the LLM response.'
        );
      }
      const extractedJson = jsonMatch[1] || jsonMatch[2] || jsonMatch[3];
      sirJson = JSON.parse(extractedJson);
    } catch (e) {
      logger.error(
        `[SIRR1Strategy] Failed to parse SIR JSON from LLM response. Error: ${e.message}. Response: ${llmJsonOutput}`
      );
      throw new Error(`LLM output was not valid JSON: ${e.message}`);
    }

    if (sirJson.error) {
      logger.warn(
        `[SIRR1Strategy] LLM indicated an error with the input for SIR generation: ${sirJson.error}`
      );
      throw new Error(
        `LLM reported error for SIR generation: ${sirJson.error}`
      );
    }

    // Validate SIR (basic validation, schema validation would be more robust)
    if (
      !sirJson.statementType ||
      (sirJson.statementType === 'fact' && !sirJson.fact) ||
      (sirJson.statementType === 'rule' && !sirJson.rule)
    ) {
      // More detailed schema validation could be added here if using a JSON schema validator
      logger.error(
        `[SIRR1Strategy] Invalid SIR JSON structure after parsing: ${JSON.stringify(sirJson)}`
      );
      throw new Error(
        'LLM output did not conform to the expected SIR JSON structure.'
      );
    }

    const prologClauses = this._convertSirToProlog(sirJson);

    if (prologClauses.length === 0) {
      logger.warn(
        `[SIRR1Strategy] No Prolog clauses generated from SIR for text: "${naturalLanguageText}"`
      );
      throw new Error(
        'Could not translate text into valid Prolog clauses via SIR.'
      );
    }
    logger.info(
      `[SIRR1Strategy] Translated to Prolog via SIR: ${JSON.stringify(prologClauses)}`
    );
    return prologClauses;
  }

  /**
   * Translates a natural language question into a symbolic query string.
   * For SIR-R1, query translation can initially be direct NL-to-Prolog.
   * @async
   * @param {string} naturalLanguageQuestion - The natural language question.
   * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
   * @param {object} [options] - Optional parameters for the query translation.
   * @param {string} [options.existingFacts=""] - Optional string of existing facts for context.
   * @param {string} [options.ontologyRules=""] - Optional string of ontology rules for context.
   * @returns {Promise<string>} A promise that resolves to a string representing the Prolog query.
   * @throws {Error} If translation fails or the generated query is invalid.
   */
  async query(naturalLanguageQuestion, llmProvider, options = {}) {
    const {
      existingFacts = '',
      ontologyRules = '',
      lexiconSummary = 'No lexicon summary available.',
    } = options;
    logger.debug(
      `[SIRR1Strategy] Translating NL query (direct): "${naturalLanguageQuestion}". Lexicon summary: ${lexiconSummary.substring(0, 100)}...`
    );

    // Using the same NL_TO_QUERY prompt as DirectS1Strategy for now.
    // This can be evolved if a query-specific SIR is developed.
    const nlToQueryPromptUser = fillTemplate(prompts.NL_TO_QUERY.user, {
      naturalLanguageQuestion,
      existingFacts,
      ontologyRules,
      lexiconSummary,
    });

    const prologQuery = await llmProvider.generate(
      prompts.NL_TO_QUERY.system,
      nlToQueryPromptUser
    );
    logger.debug(
      `[SIRR1Strategy] LLM Raw Output for NL_TO_QUERY: ${prologQuery}`
    );

    let cleanedQuery = prologQuery.trim();
    if (cleanedQuery.startsWith('?-')) {
      cleanedQuery = cleanedQuery.substring(2).trim();
    }

    // Robustly remove all trailing periods, then add one if appropriate.
    cleanedQuery = cleanedQuery.replace(/\.+$/, '').trim();

    if (cleanedQuery) {
      // Add a period if it's a standard query, or if it's 'true' or 'fail' (becoming 'true.' or 'fail.')
      // Avoid adding a period if the query is empty after trimming.
      if (
        cleanedQuery.includes('(') || // Heuristic for complex terms
        !['true', 'fail'].includes(cleanedQuery) || // Not 'true' or 'fail'
        ['true', 'fail'].includes(cleanedQuery) // Is 'true' or 'fail', ensure it gets a period
      ) {
        // This condition simplifies: if cleanedQuery is not empty, it needs a period.
        cleanedQuery += '.';
      }
    } else {
      // Query became empty after trimming and period removal
      logger.error(
        `[SIRR1Strategy] LLM generated empty Prolog query after cleaning: "${prologQuery}"`
      );
      throw new Error(
        'Failed to translate question to a valid Prolog query (empty after cleaning).'
      );
    }

    // Basic validation - a more robust Prolog parser/validator would be better
    // This check might need adjustment if queries can be simple atoms like 'fact.'
    // For now, expecting common query forms or true./fail.
    const isSimpleAtomQuery = /^[a-z_][a-zA-Z0-9_]*\.$/.test(cleanedQuery);
    const isComplexQuery = /^[a-z_'][a-zA-Z0-9_,'()]*\(.*\)\.$/.test(
      cleanedQuery
    ); // Slightly more permissive for quoted predicates

    if (!isSimpleAtomQuery && !isComplexQuery) {
      if (cleanedQuery !== 'true.' && cleanedQuery !== 'fail.') {
        logger.warn(
          `[SIRR1Strategy] Generated query "${cleanedQuery}" might be malformed (heuristic check).`
        );
      }
    }

    // Final check for validity, especially ensuring it ends with a period if not empty.
    if (!cleanedQuery || !cleanedQuery.endsWith('.')) {
      logger.error(
        `[SIRR1Strategy] LLM generated invalid Prolog query after final processing: "${cleanedQuery}" (Original: "${prologQuery}")`
      );
      throw new Error(
        'Failed to translate question to a valid query (malformed or missing period).'
      );
    }

    logger.info(`[SIRR1Strategy] Translated to Prolog query: ${cleanedQuery}`);
    return cleanedQuery;
  }
}

module.exports = SIRR1Strategy;
