// scripts/generate_example.js
const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const llmService = require('../src/llmService'); // Use imported service directly
const { prompts, fillTemplate } = require('../src/prompts'); // Adjust path
const logger = require('../src/logger'); // Adjust path
const { v4: uuidv4 } = require('uuid');

// Ensure the evalCases directory exists
const evalCasesDir = path.join(__dirname, '..', 'src', 'evalCases');
if (!fs.existsSync(evalCasesDir)) {
  fs.mkdirSync(evalCasesDir, { recursive: true });
}

async function generateExamples(domain, instructions, llmProviderName, modelName) {
  logger.info(`Generating evaluation examples for domain: "${domain}" with instructions: "${instructions}" using ${llmProviderName}`);

  if (!prompts.GENERATE_EVAL_CASES) {
    logger.error('GENERATE_EVAL_CASES prompt is not defined in prompts.js.');
    throw new Error('GENERATE_EVAL_CASES prompt is not defined.');
  }

  // Store original env vars to restore them later if changed
  const originalProvider = process.env.MCR_LLM_PROVIDER;
  const originalOpenAIModel = process.env.MCR_LLM_MODEL_OPENAI;
  const originalGeminiModel = process.env.MCR_LLM_MODEL_GEMINI;
  const originalOllamaModel = process.env.MCR_LLM_MODEL_OLLAMA;

  if (llmProviderName) {
    logger.info(`Temporarily setting LLM provider to: ${llmProviderName} for this script run.`);
    process.env.MCR_LLM_PROVIDER = llmProviderName;
    if (modelName) {
      logger.info(`Temporarily setting model to: ${modelName} for ${llmProviderName}.`);
      if (llmProviderName.toLowerCase() === 'openai') process.env.MCR_LLM_MODEL_OPENAI = modelName;
      if (llmProviderName.toLowerCase() === 'gemini') process.env.MCR_LLM_MODEL_GEMINI = modelName;
      if (llmProviderName.toLowerCase() === 'ollama') process.env.MCR_LLM_MODEL_OLLAMA = modelName;
    }
    // IMPORTANT: To make config and llmService pick up these new env vars,
    // we would need to reset their internal caches or re-require them.
    // This is tricky with Node's module caching.
    // A robust way is to have llmService.generate accept provider/model overrides.
    // For now, this script relies on being run as a separate process where env vars are set at the start.
    // If this script is called multiple times within the same long-running process with different providers,
    // it might not switch correctly without deeper changes to config/llmService.
    // The llmService.getProvider() caches `selectedProvider`.
    // To handle this for script execution:
    // 1. Modify llmService to have a reset/reinitialize function (undesirable for main lib).
    // 2. Or, the script could spawn a child process with the right env vars (complex).
    // 3. Or, llmService.generate could accept provider/model overrides (best for flexibility).
    // Given current constraints, we'll note this limitation.
    // The `evaluator.js` LlmService instance is different from the global `llmService.js` module.
  }

  const filledPrompt = fillTemplate(prompts.GENERATE_EVAL_CASES.user, { domain, instructions });
  const systemPrompt = prompts.GENERATE_EVAL_CASES.system;

  let generatedJsonString;
  try {
    generatedJsonString = await llmService.generate(systemPrompt, filledPrompt);
  } catch (error) {
    logger.error(`Error during LLM generation: ${error.message}`, error);
    throw error;
  } finally {
    // Restore original environment variables
    if (llmProviderName) {
      process.env.MCR_LLM_PROVIDER = originalProvider;
      if (modelName) {
        if (llmProviderName.toLowerCase() === 'openai') process.env.MCR_LLM_MODEL_OPENAI = originalOpenAIModel;
        if (llmProviderName.toLowerCase() === 'gemini') process.env.MCR_LLM_MODEL_GEMINI = originalGeminiModel;
        if (llmProviderName.toLowerCase() === 'ollama') process.env.MCR_LLM_MODEL_OLLAMA = originalOllamaModel;
      }
    }
  }


  logger.debug(`LLM Raw Output for eval cases:\n${generatedJsonString}`);

  let evalCases;
  try {
    // Extract JSON from markdown code block if present
    const jsonMatch = generatedJsonString.match(/```json\s*([\s\S]*?)\s*```/);
    const extractedJson = jsonMatch ? jsonMatch[1] : generatedJsonString;
    evalCases = JSON.parse(extractedJson);
  } catch (error) {
    logger.error(`Failed to parse JSON response from LLM: ${error.message}. Response was: ${generatedJsonString}`);
    throw new Error('LLM output was not valid JSON.');
  }

  if (!Array.isArray(evalCases)) {
    logger.error('LLM output was not a JSON array of evaluation cases.');
    throw new Error('LLM output was not a JSON array.');
  }

  // Validate and sanitize cases
  const validCases = [];
  for (const ec of evalCases) {
    if (!ec.id) ec.id = `${domain.replace(/\s+/g, '_').toLowerCase()}_${uuidv4().substring(0, 8)}`;
    if (!ec.description || !ec.naturalLanguageInput || !ec.inputType || !ec.expectedProlog) {
      logger.warn(`Skipping invalid case due to missing required fields: ${JSON.stringify(ec)}`);
      continue;
    }
    if (!['assert', 'query'].includes(ec.inputType)) {
      logger.warn(`Skipping invalid case due to invalid inputType: ${ec.inputType}. Case: ${ec.id}`);
      continue;
    }
    if (ec.inputType === 'query' && ec.expectedAnswer === undefined) {
        logger.warn(`Query case ${ec.id} is missing 'expectedAnswer'. It will be hard to verify.`);
    }
    ec.tags = ec.tags || [domain.toLowerCase()];
    if (!ec.tags.includes(domain.toLowerCase())) {
        ec.tags.push(domain.toLowerCase());
    }
    validCases.push(ec);
  }

  if (validCases.length === 0) {
    logger.warn('No valid evaluation cases were generated or parsed.');
    return;
  }

  const fileName = `${domain.replace(/\s+/g, '_').toLowerCase()}GeneratedEvalCases.js`;
  const filePath = path.join(evalCasesDir, fileName);

  const fileContent = `// Generated by scripts/generate_example.js for domain: ${domain}\n// Instructions: ${instructions}\n\nmodule.exports = ${JSON.stringify(validCases, null, 2)};\n`;

  fs.writeFileSync(filePath, fileContent);
  logger.info(`Successfully generated ${validCases.length} evaluation cases and saved to ${filePath}`);
}

if (require.main === module) {
  const argv = yargs(hideBin(process.argv))
    .option('domain', {
      alias: 'd',
      type: 'string',
      description: 'The domain for which to generate examples (e.g., "chemistry", "history")',
      demandOption: true,
    })
    .option('instructions', {
      alias: 'i',
      type: 'string',
      description: 'Specific instructions for the types of examples to generate',
      demandOption: true,
    })
    .option('provider', {
        alias: 'p',
        type: 'string',
        description: 'LLM provider to use (e.g., openai, gemini, ollama). Overrides .env MCR_LLM_PROVIDER for this run.',
        default: process.env.MCR_LLM_PROVIDER || 'ollama', // Default to .env or ollama
    })
    .option('model', {
        alias: 'm',
        type: 'string',
        description: 'Specific model name for the provider (e.g., gpt-4o, gemini-pro, llama3). Overrides .env model for this run.',
    })
    .help()
    .argv;

  generateExamples(argv.domain, argv.instructions, argv.provider, argv.model)
    .catch(error => {
      logger.error(`An error occurred: ${error.message}`);
      process.exit(1);
    });
}
