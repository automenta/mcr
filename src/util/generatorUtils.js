// scripts/_generatorUtils.js
const fs = require('fs');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const llmService = require('../llmService');
const logger = require('./logger');

/**
 * Common utility function for generator scripts to handle LLM calls.
 * @param {object} options - Options for generation.
 * @param {string} options.promptName - Name of the prompt (for logging).
 * @param {string} options.systemPrompt - The system prompt for the LLM.
 * @param {string} options.userPrompt - The user prompt for the LLM (already filled).
 * @param {string} [options.llmProviderName] - Optional LLM provider to override environment settings.
 * @param {string} [options.modelName] - Optional model name to override environment settings.
 * @returns {Promise<string>} The raw text output from the LLM.
 * @throws {Error} If LLM generation fails.
 */
async function generateContent({
  promptName,
  systemPrompt,
  userPrompt,
  llmProviderName,
  modelName,
}) {
  logger.info(
    `[GeneratorUtils] Generating content for prompt: "${promptName}" using ${llmProviderName || 'configured provider'}`
  );

  // Store original env vars to restore them later if changed
  const originalProvider = process.env.MCR_LLM_PROVIDER;
  const originalOpenAIModel = process.env.MCR_LLM_MODEL_OPENAI;
  const originalGeminiModel = process.env.MCR_LLM_MODEL_GEMINI;
  const originalOllamaModel = process.env.MCR_LLM_MODEL_OLLAMA;

  let currentProvider = llmProviderName;
  let currentModel = modelName;

  try {
    if (currentProvider) {
      logger.info(
        `[GeneratorUtils] Temporarily setting LLM provider to: ${currentProvider} for this generation.`
      );
      process.env.MCR_LLM_PROVIDER = currentProvider;
      if (currentModel) {
        logger.info(
          `[GeneratorUtils] Temporarily setting model to: ${currentModel} for ${currentProvider}.`
        );
        if (currentProvider.toLowerCase() === 'openai')
          process.env.MCR_LLM_MODEL_OPENAI = currentModel;
        else if (currentProvider.toLowerCase() === 'gemini')
          process.env.MCR_LLM_MODEL_GEMINI = currentModel;
        else if (currentProvider.toLowerCase() === 'ollama')
          process.env.MCR_LLM_MODEL_OLLAMA = currentModel;
        else
          logger.warn(
            `[GeneratorUtils] Model specified for unknown provider ${currentProvider}, model override might not take effect as expected.`
          );
      }
      // NOTE: This relies on llmService.getProvider() re-evaluating process.env each time,
      // or being called after these changes. If llmService caches the provider instance heavily,
      // this might not work as expected without further changes to llmService to allow explicit provider/model override.
      // For a script context, this is often acceptable as the script is a short-lived process.
    } else {
      // If no provider override, use the one from config (which reads env vars at startup)
      currentProvider = originalProvider; // For logging purposes
      currentModel = null; // Model is determined by config based on provider
    }

    // Ensure llmService is re-initialized if provider was changed by env vars
    // This is a simplified approach; a more robust solution might involve passing provider/model directly to llmService.generate
    llmService.forceReinitializeProvider();

    logger.info(
      `[GeneratorUtils] Calling LLM service. Provider: ${process.env.MCR_LLM_PROVIDER}, Model for OpenAI: ${process.env.MCR_LLM_MODEL_OPENAI}, Model for Gemini: ${process.env.MCR_LLM_MODEL_GEMINI}, Model for Ollama: ${process.env.MCR_LLM_MODEL_OLLAMA}`
    );

    const llmResult = await llmService.generate(systemPrompt, userPrompt);

    if (!llmResult || typeof llmResult.text !== 'string') {
      logger.error(
        `[GeneratorUtils] LLM generation for "${promptName}" returned invalid or empty result.`,
        { llmResult }
      );
      throw new Error(
        `LLM generation for "${promptName}" returned invalid or empty result.`
      );
    }
    logger.debug(
      `[GeneratorUtils] LLM Raw Output for ${promptName}:\n${llmResult.text}`
    );
    return llmResult.text;
  } catch (error) {
    logger.error(
      `[GeneratorUtils] Error during LLM generation for "${promptName}": ${error.message}`,
      error
    );
    throw error; // Re-throw to be handled by the calling script
  } finally {
    // Restore original environment variables
    if (llmProviderName) {
      // Only restore if we actually changed them
      process.env.MCR_LLM_PROVIDER = originalProvider;
      process.env.MCR_LLM_MODEL_OPENAI = originalOpenAIModel;
      process.env.MCR_LLM_MODEL_GEMINI = originalGeminiModel;
      process.env.MCR_LLM_MODEL_OLLAMA = originalOllamaModel;
      logger.info(
        `[GeneratorUtils] Restored original LLM environment variables.`
      );
      llmService.forceReinitializeProvider(); // Re-initialize with original settings
    }
  }
}

// // Yargs options common to generator scripts // This is unused
// const commonYargsOptions = {
//   provider: {
//     alias: 'p',
//     type: 'string',
//     describe: 'LLM provider to use (e.g., openai, gemini, ollama). Overrides .env MCR_LLM_PROVIDER for this run.',
//     default: process.env.MCR_LLM_PROVIDER || 'ollama',
//   },
//   model: {
//     alias: 'm',
//     type: 'string',
//     describe: 'Specific model name for the provider (e.g., gpt-4o, gemini-pro, llama3). Overrides .env model for this run.',
//   },
// };

// Yargs options common to generator scripts
const commonYargsOptionsSpec = {
  provider: {
    alias: 'p',
    type: 'string',
    describe:
      'LLM provider to use (e.g., openai, gemini, ollama). Overrides .env MCR_LLM_PROVIDER for this run.',
    // Default is handled dynamically in setupGeneratorScript to use env var at runtime
  },
  model: {
    alias: 'm',
    type: 'string',
    describe:
      'Specific model name for the provider (e.g., gpt-4o, gemini-pro, llama3). Overrides .env model for this run.',
  },
};

/**
 * Sets up yargs for a generator script, including common and script-specific options.
 * @param {object} scriptSpecificOptions - An object where keys are option names and values are yargs option configurations.
 * @param {string} scriptFileName - The name of the script file (e.g., 'generate_example.js').
 * @returns {object} The parsed argv object.
 */
function setupGeneratorScript(
  scriptSpecificOptions,
  scriptFileName = 'generator_script.js'
) {
  let yargsInstance = yargs(hideBin(process.argv));

  // Add script-specific options
  for (const optionName in scriptSpecificOptions) {
    yargsInstance = yargsInstance.option(
      optionName,
      scriptSpecificOptions[optionName]
    );
  }

  // Add common options, applying default for provider dynamically
  yargsInstance = yargsInstance
    .option('provider', {
      ...commonYargsOptionsSpec.provider,
      default: process.env.MCR_LLM_PROVIDER || 'ollama', // Apply default here
    })
    .option('model', commonYargsOptionsSpec.model);

  return yargsInstance
    .help()
    .alias('help', 'h')
    .epilogue(`Run with ${scriptFileName} --help for more information.`).argv;
}

/**
 * Ensures a directory exists, creating it if necessary.
 * @param {string} dirPath - The path to the directory.
 */
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    logger.info(
      `[GeneratorUtils] Directory ${dirPath} does not exist, creating it.`
    );
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Writes content to a file, prepending a standardized header comment.
 * @param {object} options - Options for file writing.
 * @param {string} options.filePath - The full path to the file to be written.
 * @param {string} options.content - The main content to write to the file.
 * @param {string} options.domain - The domain used for generation.
 * @param {string} options.instructions - The instructions used for generation.
 * @param {string} options.scriptName - The name of the script that generated the file.
 */
function writeGeneratedFile({
  filePath,
  content,
  domain,
  instructions,
  scriptName,
}) {
  const header = `// Generated by ${scriptName} for domain: ${domain}\n// Instructions: ${instructions}\n\n`;
  const fileContent = header + content;
  fs.writeFileSync(filePath, fileContent);
  logger.info(
    `[GeneratorUtils] Successfully generated file and saved to ${filePath}`
  );
}

module.exports = {
  generateContent,
  // commonYargsOptions is now incorporated into setupGeneratorScript
  setupGeneratorScript,
  ensureDirectoryExists,
  writeGeneratedFile,
};
