// scripts/generate_example.js
const path = require('path');
const { prompts, fillTemplate } = require('../src/prompts');
const logger = require('../src/logger');
const { v4: uuidv4 } = require('uuid');
const {
  generateContent,
  setupGeneratorScript,
  ensureDirectoryExists,
  writeGeneratedFile,
} = require('./src/util/generatorUtils');

const SCRIPT_NAME = 'generate_example.js';
const evalCasesDir = path.join(__dirname, '..', 'src', 'evalCases');

async function createEvaluationExamples(
  domain,
  instructions,
  llmProviderName,
  modelName
) {
  logger.info(
    `[${SCRIPT_NAME}] Creating evaluation examples for domain: "${domain}" with instructions: "${instructions}" using ${llmProviderName}`
  );

  if (!prompts.GENERATE_EVAL_CASES) {
    logger.error('GENERATE_EVAL_CASES prompt is not defined in prompts.js.');
    throw new Error('GENERATE_EVAL_CASES prompt is not defined.');
  }

  const filledUserPrompt = fillTemplate(prompts.GENERATE_EVAL_CASES.user, {
    domain,
    instructions,
  });
  const systemPrompt = prompts.GENERATE_EVAL_CASES.system;

  const generatedJsonString = await generateContent({
    promptName: 'GENERATE_EVAL_CASES',
    systemPrompt,
    userPrompt: filledUserPrompt,
    llmProviderName,
    modelName,
  });

  let evalCases;
  try {
    const jsonMatch = generatedJsonString.match(/```json\s*([\s\S]*?)\s*```/);
    const extractedJson = jsonMatch ? jsonMatch[1] : generatedJsonString;
    evalCases = JSON.parse(extractedJson);
  } catch (error) {
    logger.error(
      `Failed to parse JSON response from LLM: ${error.message}. Response was: ${generatedJsonString}`
    );
    throw new Error('LLM output was not valid JSON.');
  }

  if (!Array.isArray(evalCases)) {
    logger.error('LLM output was not a JSON array of evaluation cases.');
    throw new Error('LLM output was not a JSON array.');
  }

  const validCases = [];
  for (const ec of evalCases) {
    if (!ec.id)
      ec.id = `${domain.replace(/\s+/g, '_').toLowerCase()}_${uuidv4().substring(0, 8)}`;
    if (
      !ec.description ||
      !ec.naturalLanguageInput ||
      !ec.inputType ||
      !ec.expectedProlog
    ) {
      logger.warn(
        `Skipping invalid case due to missing required fields: ${JSON.stringify(ec)}`
      );
      continue;
    }
    if (!['assert', 'query'].includes(ec.inputType)) {
      logger.warn(
        `Skipping invalid case due to invalid inputType: ${ec.inputType}. Case: ${ec.id}`
      );
      continue;
    }
    if (ec.inputType === 'query' && ec.expectedAnswer === undefined) {
      logger.warn(
        `Query case ${ec.id} is missing 'expectedAnswer'. It will be hard to verify.`
      );
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
  const outputContent = `module.exports = ${JSON.stringify(validCases, null, 2)};\n`;

  ensureDirectoryExists(evalCasesDir);
  writeGeneratedFile({
    filePath,
    content: outputContent,
    domain,
    instructions,
    scriptName: SCRIPT_NAME,
  });

  logger.info(
    `[${SCRIPT_NAME}] Successfully generated ${validCases.length} evaluation cases.`
  );
}

if (require.main === module) {
  const scriptSpecificOptions = {
    domain: {
      alias: 'd',
      type: 'string',
      description:
        'The domain for which to generate examples (e.g., "chemistry", "history")',
      demandOption: true,
    },
    instructions: {
      alias: 'i',
      type: 'string',
      description:
        'Specific instructions for the types of examples to generate',
      demandOption: true,
    },
  };
  const argv = setupGeneratorScript(scriptSpecificOptions, SCRIPT_NAME);

  createEvaluationExamples(
    argv.domain,
    argv.instructions,
    argv.provider,
    argv.model
  ).catch((error) => {
    logger.error(`An error occurred in ${SCRIPT_NAME}: ${error.message}`);
    process.exit(1);
  });
}
