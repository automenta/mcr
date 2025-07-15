// src/strategyExecutor.js
const logger = require('./util/logger');
const { prompts, fillTemplate } = require('./prompts');
const { MCRError, ErrorCodes } = require('./errors');

/**
 * @file src/strategyExecutor.js
 * Implements the StrategyExecutor class responsible for running JSON-defined translation strategy workflows.
 */
// NOTE: The require statements for logger, prompts, and errors were already present at the top of the file.
// The duplicated lines below were removed.
// const logger = require('./logger');
// const { prompts, fillTemplate } = require('./prompts');
// const { MCRError, ErrorCodes } = require('./errors');

/**
 * Converts a Structured Intermediate Representation (SIR) JSON object into Prolog clauses.
 * This function is a core part of strategies that use SIR.
 * @param {object | object[]} sirJson - The SIR JSON data, can be a single SIR object or an array of SIR objects.
 * @param {string} [strategyName='UnknownStrategy'] - The name of the strategy, for logging purposes.
 * @returns {string[]} An array of Prolog clause strings.
 * @throws {MCRError} If the SIR JSON structure is invalid or arguments are of unexpected types.
 */
function convertSirToProlog(sirJson, strategyName = 'UnknownStrategy') {
  const clauses = [];
  const formatTerm = term => {
    if (
      !term ||
      typeof term.predicate !== 'string' ||
      !Array.isArray(term.arguments)
    ) {
      throw new MCRError(
        ErrorCodes.INVALID_SIR_STRUCTURE,
        `Invalid term structure in SIR JSON: ${JSON.stringify(term)}`
      );
    }
    let predicateToFormat = term.predicate;
    // Basic atom validation/quoting (simplified)
    if (!/^[a-z_][a-zA-Z0-9_]*$/.test(predicateToFormat)) {
      predicateToFormat = `'${predicateToFormat.replace(/'/g, "''")}'`;
    }

    const formatArgument = arg => {
      if (Array.isArray(arg)) {
        const formattedListArgs = arg.map(formatArgument).join(',');
        return `[${formattedListArgs}]`;
      }
      if (typeof arg === 'number') {
        return arg.toString();
      }
      if (typeof arg !== 'string') {
        throw new MCRError(
          ErrorCodes.INVALID_SIR_ARGUMENT,
          `Argument is not a string, number or array: ${JSON.stringify(arg)}`
        );
      }
      if (arg.match(/^[A-Z_][a-zA-Z0-9_]*$/)) return arg; // Variable
      if (arg.match(/^-?\d+(\.\d+)?$/) && !isNaN(parseFloat(arg))) return arg; // Number as string
      if (arg.match(/^[a-z_][a-zA-Z0-9_]*$/)) return arg; // Simple atom
      const escapedArg = arg.replace(/'/g, "''"); // Basic escaping
      return `'${escapedArg}'`;
    };

    const formattedArgs = term.arguments.map(formatArgument);
    return `${predicateToFormat}(${formattedArgs.join(',')})`;
  };

  const processSingleSirItem = item => {
    if (item.statementType === 'fact' && item.fact) {
      let clause = formatTerm(item.fact);
      if (item.fact.isNegative) {
        // Handle isNegative property
        clause = `not(${clause})`;
      }
      clauses.push(`${clause}.`);
    } else if (
      item.statementType === 'rule' &&
      item.rule &&
      item.rule.head &&
      Array.isArray(item.rule.body)
    ) {
      const headStr = formatTerm(item.rule.head);
      if (item.rule.body.length === 0) {
        clauses.push(`${headStr}.`);
      } else {
        const bodyStr = item.rule.body
          .map(bodyTerm => {
            let term = formatTerm(bodyTerm);
            if (bodyTerm.isNegative) {
              // Handle isNegative property for body terms
              term = `not(${term})`;
            }
            return term;
          })
          .join(', ');
        clauses.push(`${headStr} :- ${bodyStr}.`);
      }
    } else {
      logger.warn(
        `[${strategyName}] Invalid SIR structure for item: ${JSON.stringify(item)}`
      );
      // Not throwing an error here to be lenient, but could be stricter
    }
  };

  if (Array.isArray(sirJson)) {
    sirJson.forEach(processSingleSirItem);
  } else if (
    typeof sirJson === 'object' &&
    sirJson !== null &&
    sirJson.statementType
  ) {
    processSingleSirItem(sirJson);
  } else if (sirJson && Object.keys(sirJson).length > 0) {
    // Check if it's a non-empty object that doesn't match expected structure
    logger.warn(
      `[${strategyName}] Unexpected SIR JSON format. Expected object with statementType or array of such objects. Received: ${JSON.stringify(sirJson).substring(0, 200)}`
    );
    // Potentially throw new MCRError(ErrorCodes.INVALID_SIR_STRUCTURE, `Unexpected SIR JSON format.`);
  }
  // If sirJson is empty or null, clauses will remain empty, which is acceptable.

  return clauses;
}

/**
 * Converts a Logical Form (LF) JSON object into Prolog clauses.
 * @param {object | object[]} lfJson - The LF JSON data, can be a single LF object or an array of LF objects.
 * @param {string} [strategyName='UnknownStrategy'] - The name of the strategy, for logging purposes.
 * @returns {string[]} An array of Prolog clause strings.
 * @throws {MCRError} If the LF JSON structure is invalid or arguments are of unexpected types.
 */
function convertLfToProlog(lfJson, strategyName = 'UnknownStrategy') {
  const clauses = [];

  const formatLfArgument = arg => {
    if (!arg || !arg.type) {
      throw new MCRError(
        ErrorCodes.INVALID_LF_STRUCTURE,
        `Invalid LF argument structure: ${JSON.stringify(arg)} in ${strategyName}`
      );
    }
    switch (arg.type) {
      case 'variable':
        if (
          !arg.name ||
          typeof arg.name !== 'string' ||
          !/^[A-Z_][a-zA-Z0-9_]*$/.test(arg.name)
        ) {
          throw new MCRError(
            ErrorCodes.INVALID_LF_ARGUMENT,
            `Invalid variable name: ${JSON.stringify(arg.name)} in ${strategyName}`
          );
        }
        return arg.name;
      case 'atom':
        if (typeof arg.value !== 'string') {
          throw new MCRError(
            ErrorCodes.INVALID_LF_ARGUMENT,
            `Atom value must be a string: ${JSON.stringify(arg.value)} in ${strategyName}`
          );
        }
        // Basic atom validation/quoting (simplified)
        if (/^[a-z_][a-zA-Z0-9_]*$/.test(arg.value) && arg.value !== 'not') {
          // 'not' needs quoting if it's an atom
          return arg.value;
        }
        return `'${arg.value.replace(/'/g, "''")}'`; // Quoted atom
      case 'number':
        if (typeof arg.value !== 'number') {
          throw new MCRError(
            ErrorCodes.INVALID_LF_ARGUMENT,
            `Number value must be a number: ${JSON.stringify(arg.value)} in ${strategyName}`
          );
        }
        return arg.value.toString();
      case 'list':
        if (!Array.isArray(arg.elements)) {
          throw new MCRError(
            ErrorCodes.INVALID_LF_ARGUMENT,
            `List elements must be an array: ${JSON.stringify(arg.elements)} in ${strategyName}`
          );
        }
        return `[${arg.elements.map(formatLfArgument).join(',')}]`;
      // Allow complex terms (functors) as arguments directly
      case 'term':
        if (
          !arg.value ||
          typeof arg.value.predicate !== 'string' ||
          !Array.isArray(arg.value.args)
        ) {
          throw new MCRError(
            ErrorCodes.INVALID_LF_ARGUMENT,
            `Invalid nested term structure for argument: ${JSON.stringify(arg.value)} in ${strategyName}`
          );
        }
        return formatLfTerm(arg.value);
      default:
        throw new MCRError(
          ErrorCodes.INVALID_LF_ARGUMENT,
          `Unknown LF argument type: ${arg.type} in ${strategyName}`
        );
    }
  };

  const formatLfTerm = term => {
    if (
      !term ||
      typeof term.predicate !== 'string' ||
      !Array.isArray(term.args)
    ) {
      throw new MCRError(
        ErrorCodes.INVALID_LF_STRUCTURE,
        `Invalid LF term structure: ${JSON.stringify(term)} in ${strategyName}`
      );
    }
    let predicateToFormat = term.predicate;
    // Basic atom validation/quoting (simplified)
    if (
      !/^[a-z_][a-zA-Z0-9_]*$/.test(predicateToFormat) ||
      predicateToFormat === 'not'
    ) {
      predicateToFormat = `'${predicateToFormat.replace(/'/g, "''")}'`;
    }
    const formattedArgs = term.args.map(formatLfArgument);
    let result = `${predicateToFormat}(${formattedArgs.join(',')})`;
    if (term.isNegative === true) {
      result = `not(${result})`;
    }
    return result;
  };

  const processSingleLfItem = item => {
    if (!item || !item.type) {
      logger.warn(
        `[${strategyName}] Invalid LF item structure, missing type: ${JSON.stringify(item)}`
      );
      return;
    }
    switch (item.type) {
      case 'fact':
        if (!item.term) {
          throw new MCRError(
            ErrorCodes.INVALID_LF_STRUCTURE,
            `LF 'fact' item missing 'term': ${JSON.stringify(item)} in ${strategyName}`
          );
        }
        clauses.push(`${formatLfTerm(item.term)}.`);
        break;
      case 'rule':
        if (!item.head || !item.body) {
          throw new MCRError(
            ErrorCodes.INVALID_LF_STRUCTURE,
            `LF 'rule' item missing 'head' or 'body': ${JSON.stringify(item)} in ${strategyName}`
          );
        }
        const headStr = formatLfTerm(item.head); // Head itself cannot be negated with 'isNegative' at top level of head
        if (!Array.isArray(item.body)) {
          throw new MCRError(
            ErrorCodes.INVALID_LF_STRUCTURE,
            `LF 'rule' body must be an array of terms: ${JSON.stringify(item.body)} in ${strategyName}`
          );
        }
        if (item.body.length === 0) {
          clauses.push(`${headStr}.`); // Fact-rule (rule with empty body)
        } else {
          // Body terms can be negated using 'isNegative' property on each term object
          const bodyStr = item.body.map(formatLfTerm).join(', ');
          clauses.push(`${headStr} :- ${bodyStr}.`);
        }
        break;
      default:
        logger.warn(
          `[${strategyName}] Unknown LF item type: ${item.type} for item: ${JSON.stringify(item)}`
        );
    }
  };

  if (Array.isArray(lfJson)) {
    lfJson.forEach(processSingleLfItem);
  } else if (typeof lfJson === 'object' && lfJson !== null && lfJson.type) {
    processSingleLfItem(lfJson);
  } else if (lfJson && Object.keys(lfJson).length > 0) {
    logger.warn(
      `[${strategyName}] Unexpected LF JSON format. Expected object with type or array of such objects. Received: ${JSON.stringify(lfJson).substring(0, 200)}`
    );
  }
  return clauses;
}

/**
 * @class StrategyExecutor
 * Executes a translation strategy defined by a JSON object.
 * The strategy JSON outlines a workflow graph of nodes (operations) and edges (data flow).
 */
class StrategyExecutor {
  /**
   * Creates an instance of StrategyExecutor.
   * @param {object} strategyJson - The parsed JSON object defining the strategy.
   *                                Must include `id`, `name`, `nodes`, and `edges`.
   * @throws {MCRError} If the strategyJson is invalid or missing required fields.
   */
  constructor(strategyJson) {
    if (
      !strategyJson ||
      !strategyJson.id ||
      !Array.isArray(strategyJson.nodes) ||
      !Array.isArray(strategyJson.edges)
    ) {
      throw new MCRError(
        ErrorCodes.INVALID_STRATEGY_DEFINITION,
        `Strategy JSON is invalid or missing required fields (id, nodes, edges). Provided: ${JSON.stringify(strategyJson)}`
      );
    }
    this.strategy = strategyJson;
    this.nodeMap = new Map(strategyJson.nodes.map(node => [node.id, node]));
    this.adjacencyMap = new Map();
    strategyJson.edges.forEach(edge => {
      if (!this.adjacencyMap.has(edge.from)) {
        this.adjacencyMap.set(edge.from, []);
      }
      this.adjacencyMap.get(edge.from).push(edge.to);
    });

    logger.info(
      `[StrategyExecutor] Initialized for strategy: ${this.strategy.id}`
    );
  }

  _findStartNode() {
    const targetNodeIds = new Set(this.strategy.edges.map(edge => edge.to));
    const startNodes = this.strategy.nodes.filter(
      node => !targetNodeIds.has(node.id)
    );
    if (startNodes.length === 0) {
      throw new MCRError(
        ErrorCodes.INVALID_STRATEGY_DEFINITION,
        `Strategy ${this.strategy.id} has no start node (a node with no incoming edges).`
      );
    }
    if (startNodes.length > 1) {
      // This could be supported if we define a clear entry point or allow multiple parallel starts.
      // For now, assume one clear starting point for simplicity in Phase 1.
      logger.warn(
        `[StrategyExecutor] Strategy ${this.strategy.id} has multiple potential start nodes. Using the first one found: ${startNodes[0].id}.`
      );
    }
    return startNodes[0];
  }

  /**
   * Executes the strategy workflow.
   * @param {ILlmProvider} llmProvider - An instance of an LLM provider.
   * @param {IReasonProvider} reasonerService - An instance of a reasoner service provider.
   * @param {object} initialContext - The initial context for the execution,
   *                                  e.g., { naturalLanguageText, existingFacts, ontologyRules, lexiconSummary }
   *                                  or { naturalLanguageQuestion, existingFacts, ontologyRules, lexiconSummary }
   * @returns {Promise<any>} The final output of the strategy.
   * @throws {MCRError} If execution fails at any step or the graph is malformed.
   */
  async execute(llmProvider, reasonerService, initialContext) {
    logger.info(
      `[StrategyExecutor] Executing strategy "${this.strategy.id}"...`
    );
    const executionState = { ...initialContext }; // Holds variables like sir_json_string, prolog_clauses etc.
    const visited = new Set();
    const queue = [this._findStartNode().id]; // Start with the ID of the start node

    let finalOutput; // To store the output of the designated final node if one exists

    while (queue.length > 0) {
      const currentNodeId = queue.shift();

      if (visited.has(currentNodeId)) {
        // This could indicate a cycle if not handled carefully, or just re-visiting in a DAG.
        // For simple linear flows or DAGs, this might be okay if inputs are stable.
        // For now, processing a node once. Complex graphs might need different handling.
        logger.debug(
          `[StrategyExecutor] Skipping already visited node: ${currentNodeId}`
        );
        continue;
      }

      const node = this.nodeMap.get(currentNodeId);
      if (!node) {
        throw new MCRError(
          ErrorCodes.INVALID_STRATEGY_DEFINITION,
          `Node ${currentNodeId} not found in strategy ${this.strategy.id}`
        );
      }

      logger.debug(
        `[StrategyExecutor] Processing node: ${node.id} (Type: ${node.type})`
      );
      visited.add(currentNodeId);

      let output;
      try {
        switch (node.type) {
          case 'LLM_Call': {
            let systemPrompt, userPrompt;
            const templateContext = {
              ...executionState,
              llm_model_id:
                node.model || initialContext.llm_model_id || 'default_model',
            };

            if (node.prompt_text && node.prompt_text.user) {
              systemPrompt = node.prompt_text.system || ''; // Default to empty string if system prompt not provided
              userPrompt = fillTemplate(node.prompt_text.user, templateContext);
              logger.debug(
                `[StrategyExecutor] Node ${node.id}: Using embedded prompt text.`
              );
            } else if (node.prompt_template_name) {
              const promptTemplate = prompts[node.prompt_template_name];
              if (!promptTemplate) {
                throw new MCRError(
                  ErrorCodes.PROMPT_TEMPLATE_NOT_FOUND,
                  `Prompt template "${node.prompt_template_name}" not found for node ${node.id}.`
                );
              }
              systemPrompt = promptTemplate.system;
              userPrompt = fillTemplate(promptTemplate.user, templateContext);
              logger.debug(
                `[StrategyExecutor] Node ${node.id}: Using named prompt template '${node.prompt_template_name}'. Context keys: ${Object.keys(templateContext).join(', ')}`
              );
            } else {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `LLM_Call node ${node.id} missing required 'prompt_template_name' or 'prompt_text' property.`
              );
            }

            const llmResult = await llmProvider.generate(
              systemPrompt,
              userPrompt
            );
            output = llmResult.text;
            // TODO: Accumulate llmResult.costData into totalCost for the execution
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: LLM call completed. Output length: ${output?.length}`
            );
            break;
          }
          case 'Parse_JSON':
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `Parse_JSON node ${node.id} missing 'input_variable'.`
              );
            }
            const jsonString = executionState[node.input_variable];
            if (typeof jsonString !== 'string') {
              throw new MCRError(
                ErrorCodes.INVALID_NODE_INPUT,
                `Input for Parse_JSON node ${node.id} (variable '${node.input_variable}') is not a string. Found: ${typeof jsonString}`
              );
            }
            try {
              // Try to extract from markdown code block first
              const jsonMatch = jsonString.match(
                /```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])|({[\s\S]*})/
              );
              if (!jsonMatch) {
                // Fallback to parsing the whole string if no markdown block or direct array/object found at top level
                logger.debug(
                  `[StrategyExecutor] Node ${node.id}: No JSON markdown code block found, attempting to parse entire input as JSON. Input: ${jsonString.substring(0, 100)}...`
                );
                output = JSON.parse(jsonString);
              } else {
                const extractedJson =
                  jsonMatch[1] || jsonMatch[2] || jsonMatch[3];
                output = JSON.parse(extractedJson);
                logger.debug(
                  `[StrategyExecutor] Node ${node.id}: Extracted and parsed JSON from code block/direct structure.`
                );
              }
            } catch (e) {
              logger.error(
                `[StrategyExecutor] Node ${node.id}: Failed to parse JSON string from variable '${node.input_variable}'. Error: ${e.message}. String: ${jsonString.substring(0, 200)}...`
              );
              throw new MCRError(
                ErrorCodes.JSON_PARSING_FAILED,
                `Failed to parse JSON for node ${node.id}: ${e.message}`
              );
            }
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: JSON parsing completed.`
            );
            break;

          case 'SIR_To_Prolog':
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `SIR_To_Prolog node ${node.id} missing 'input_variable'.`
              );
            }
            const sirJson = executionState[node.input_variable];
            if (typeof sirJson !== 'object' || sirJson === null) {
              throw new MCRError(
                ErrorCodes.INVALID_NODE_INPUT,
                `Input for SIR_To_Prolog node ${node.id} (variable '${node.input_variable}') is not an object. Found: ${typeof sirJson}`
              );
            }
            output = convertSirToProlog(
              sirJson,
              this.strategy.name || this.strategy.id
            ); // Pass strategy name for logging
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: SIR to Prolog conversion completed. Clauses generated: ${output.length}`
            );
            break;

          case 'LF_To_Prolog': // New Node Type for LF
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `LF_To_Prolog node ${node.id} missing 'input_variable'.`
              );
            }
            const lfJson = executionState[node.input_variable];
            if (typeof lfJson !== 'object' || lfJson === null) {
              throw new MCRError(
                ErrorCodes.INVALID_NODE_INPUT,
                `Input for LF_To_Prolog node ${node.id} (variable '${node.input_variable}') is not an object. Found: ${typeof lfJson}`
              );
            }
            output = convertLfToProlog(
              lfJson,
              this.strategy.name || this.strategy.id
            );
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: LF to Prolog conversion completed. Clauses generated: ${output.length}`
            );
            break;

          case 'Split_String_To_Array':
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `Split_String_To_Array node ${node.id} missing 'input_variable'.`
              );
            }
            const stringToSplit = executionState[node.input_variable];
            if (typeof stringToSplit !== 'string') {
              throw new MCRError(
                ErrorCodes.INVALID_NODE_INPUT,
                `Input for Split_String_To_Array node ${node.id} (variable '${node.input_variable}') is not a string. Found: ${typeof stringToSplit}`
              );
            }
            const delimiter = node.delimiter || '\n'; // Default to newline
            output = stringToSplit
              .split(delimiter)
              .map(s => s.trim())
              .filter(s => s.length > 0);
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: String splitting completed. Array size: ${output.length}`
            );
            break;

          case 'Extract_Prolog_Query': // For query strategies that output a query string
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `Extract_Prolog_Query node ${node.id} missing 'input_variable'.`
              );
            }
            const rawQueryOutput = executionState[node.input_variable];
            if (typeof rawQueryOutput !== 'string') {
              throw new MCRError(
                ErrorCodes.INVALID_NODE_INPUT,
                `Input for Extract_Prolog_Query node ${node.id} (variable '${node.input_variable}') is not a string. Found: ${typeof rawQueryOutput}`
              );
            }
            let cleanedQuery = rawQueryOutput.trim();
            // Remove potential "prolog", "```prolog", "```" wrappers
            cleanedQuery = cleanedQuery
              .replace(/^(?:prolog\s*)?```(?:prolog)?\s*/i, '')
              .replace(/\s*```$/, '');

            if (cleanedQuery.startsWith('?-')) {
              cleanedQuery = cleanedQuery.substring(2).trim();
            }
            cleanedQuery = cleanedQuery.replace(/\.+$/, '').trim(); // Remove all trailing periods
            if (cleanedQuery) {
              cleanedQuery += '.'; // Add one period back
            } else {
              logger.warn(
                `[StrategyExecutor] Node ${node.id}: LLM generated empty Prolog query after cleaning: "${rawQueryOutput}"`
              );
              // Depending on strictness, could throw error or return empty string.
              // For now, let it proceed, downstream validation might catch it.
            }
            output = cleanedQuery;
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: Prolog query extraction completed. Query: "${output}"`
            );
            break;

          case 'Reasoner_Call':
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `Reasoner_Call node ${node.id} missing 'input_variable'.`
              );
            }
            const queryToRun = executionState[node.input_variable];
            if (typeof queryToRun !== 'string') {
              throw new MCRError(
                ErrorCodes.INVALID_NODE_INPUT,
                `Input for Reasoner_Call node ${node.id} (variable '${node.input_variable}') is not a string. Found: ${typeof queryToRun}`
              );
            }
            // Use the session's knowledge base from the execution state.
            // This assumes 'existingFacts' is consistently populated in the initial context.
            const kbForReasonerCall = executionState.existingFacts || '';
            // Add ontology rules if they are also in the context
            const ontologyForReasonerCall = executionState.ontologyRules || '';
            const fullKbForCall = `${kbForReasonerCall}\n${ontologyForReasonerCall}`;

            output = await reasonerService.executeQuery(
              fullKbForCall,
              queryToRun
            );
            logger.debug(
              `[StrategyExecutor] Node ${node.id}: Reasoner_Call completed. Results: ${JSON.stringify(output)}`
            );
            break;

          case 'PrologRewrite':
            const { runRewrite } = require('../neurosymbolic/prologRewrite.js');
            const code = node.code;
            const factsIn = executionState[node.input_variable];
            const rewritten = runRewrite(code, factsIn);
            output = rewritten;
            break;

          case 'Conditional_Router': {
            if (!node.input_variable) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `Conditional_Router node ${node.id} missing 'input_variable'.`
              );
            }
            if (!Array.isArray(node.branches) || node.branches.length === 0) {
              throw new MCRError(
                ErrorCodes.INVALID_STRATEGY_NODE,
                `Conditional_Router node ${node.id} missing 'branches' array or branches are empty.`
              );
            }

            const inputValue = executionState[node.input_variable];
            let routed = false;
            let defaultTarget = null;

            for (const branch of node.branches) {
              if (!branch.target) {
                logger.warn(
                  `[StrategyExecutor] Node ${node.id}: Branch ${JSON.stringify(branch)} missing 'target'. Skipping.`
                );
                continue;
              }
              if (branch.condition === 'default') {
                defaultTarget = branch.target;
                continue; // Evaluate default branch last
              }

              if (branch.condition === 'property_exists') {
                if (!branch.property) {
                  logger.warn(
                    `[StrategyExecutor] Node ${node.id}: Branch ${JSON.stringify(branch)} 'property_exists' missing 'property'. Skipping.`
                  );
                  continue;
                }
                // Check if inputValue is an object and has the property
                if (
                  typeof inputValue === 'object' &&
                  inputValue !== null &&
                  Object.prototype.hasOwnProperty.call(
                    inputValue,
                    branch.property
                  )
                ) {
                  logger.debug(
                    `[StrategyExecutor] Node ${node.id}: Condition 'property_exists' for property '${branch.property}' met. Routing to '${branch.target}'.`
                  );
                  if (
                    !visited.has(branch.target) &&
                    !queue.includes(branch.target)
                  ) {
                    queue.push(branch.target);
                  }
                  routed = true;
                  break; // Route to the first met condition
                }
              } else {
                logger.warn(
                  `[StrategyExecutor] Node ${node.id}: Unknown condition type '${branch.condition}' in branch. Skipping.`
                );
              }
            }

            if (!routed && defaultTarget) {
              logger.debug(
                `[StrategyExecutor] Node ${node.id}: No explicit condition met. Routing to default target '${defaultTarget}'.`
              );
              if (
                !visited.has(defaultTarget) &&
                !queue.includes(defaultTarget)
              ) {
                queue.push(defaultTarget);
              }
              routed = true;
            }

            if (!routed) {
              logger.warn(
                `[StrategyExecutor] Node ${node.id}: No conditions met and no default branch taken. Workflow may halt here for this path.`
              );
            }
            // Conditional_Router does not produce an 'output' in the typical sense to be stored in output_variable.
            // It directs control flow. So, 'output' remains undefined.
            break;
          }

          default:
            throw new MCRError(
              ErrorCodes.UNKNOWN_NODE_TYPE,
              `Unknown node type "${node.type}" in strategy ${this.strategy.id} for node ${node.id}.`
            );
        }

        // If the current node is a Conditional_Router, it handles its own routing, so we skip the generic nextNodeId queuing.
        if (node.type === 'Conditional_Router') {
          // Output for Conditional_Router is undefined as it only directs flow.
          // It doesn't set finalOutput or executionState unless specifically designed to do so, which is not typical for a router.
        } else if (node.output_variable) {
          executionState[node.output_variable] = output;
          logger.debug(
            `[StrategyExecutor] Node ${node.id}: Stored output in variable '${node.output_variable}'. Value: ${JSON.stringify(output)}`
          );
        } else {
          // Only set finalOutput if it's not a Conditional_Router, as routers don't have a singular output value.
          finalOutput = output;
          logger.debug(
            `[StrategyExecutor] Node ${node.id}: Output not stored in a variable, considered as potential final output. Value: ${JSON.stringify(output)}`
          );
        }

        // Standard way to queue next nodes, unless it's a Conditional_Router which handles its own branching.
        if (node.type !== 'Conditional_Router') {
          const nextNodeIds = this.adjacencyMap.get(currentNodeId) || [];
          nextNodeIds.forEach(nextNodeId => {
            if (!visited.has(nextNodeId) && !queue.includes(nextNodeId)) {
              queue.push(nextNodeId);
            }
          });
        }
      } catch (error) {
        logger.error(
          `[StrategyExecutor] Error processing node ${node.id} (Type: ${node.type}) in strategy ${this.strategy.id}: ${error.message}`,
          { stack: error.stack, details: error.details }
        );
        // Enrich error with strategy and node context
        const enrichedError = new MCRError(
          error.code || ErrorCodes.STRATEGY_EXECUTION_ERROR,
          `Execution failed at node '${node.id}' (Type: ${node.type}) in strategy '${this.strategy.id}': ${error.message}`,
          error.details || { originalStack: error.stack }
        );
        enrichedError.strategyId = this.strategy.id;
        enrichedError.nodeId = node.id;
        enrichedError.nodeType = node.type;
        throw enrichedError;
      }
    }

    if (visited.size !== this.strategy.nodes.length) {
      const unvisitedNodes = this.strategy.nodes
        .filter(n => !visited.has(n.id))
        .map(n => n.id);
      logger.warn(
        `[StrategyExecutor] Strategy ${this.strategy.id} execution completed, but not all nodes were visited. Unvisited: ${unvisitedNodes.join(', ')}. This might be normal for conditional graphs.`
      );
      // Depending on graph type (e.g., if conditional paths are allowed), this might not be an error.
      // For simple sequential graphs, it would be.
    }

    // Determine the final output.
    // If an 'output_node_id' is specified in the strategy JSON, use its output.
    // Otherwise, use the 'finalOutput' collected (output of the last processed node without an output_variable).
    // Or, if a specific 'result_variable' is defined in strategy JSON, use that from executionState.
    let result;
    if (
      this.strategy.result_variable &&
      Object.prototype.hasOwnProperty.call(
        executionState,
        this.strategy.result_variable
      ) // Fixed: Use Object.prototype.hasOwnProperty.call
    ) {
      result = executionState[this.strategy.result_variable];
      logger.info(
        `[StrategyExecutor] Strategy "${this.strategy.id}" execution finished. Returning result from specified 'result_variable': ${this.strategy.result_variable}.`
      );
    } else if (finalOutput !== undefined) {
      result = finalOutput;
      logger.info(
        `[StrategyExecutor] Strategy "${this.strategy.id}" execution finished. Returning output of last processed node without an output_variable.`
      );
    } else {
      logger.warn(
        `[StrategyExecutor] Strategy "${this.strategy.id}" execution finished, but no clear final output was determined (no 'result_variable' set and last node might have saved its output). Returning entire execution state for debugging.`
      );
      result = executionState; // Fallback for debugging, not ideal for production
    }
    logger.debug(
      `[StrategyExecutor] Final execution result for strategy "${this.strategy.id}":`,
      result
    );
    return result;
  }
}

module.exports = StrategyExecutor;
