// scripts/generate_ontology.js
const path = require('path');
const { prompts, fillTemplate } = require('../src/prompts');
const logger = require('../src/logger');
const {
  generateContent,
  setupGeneratorScript,
  ensureDirectoryExists,
  writeGeneratedFile,
} = require('./_generatorUtils');

const SCRIPT_NAME = 'generate_ontology.js';
const ontologiesDir = path.join(__dirname, '..', 'ontologies');

async function createOntology(
  domain,
  instructions,
  llmProviderName,
  modelName
) {
  logger.info(
    `[${SCRIPT_NAME}] Creating ontology for domain: "${domain}" with instructions: "${instructions}" using ${llmProviderName}`
  );

  if (!prompts.GENERATE_ONTOLOGY) {
    logger.error('GENERATE_ONTOLOGY prompt is not defined in prompts.js.');
    throw new Error('GENERATE_ONTOLOGY prompt is not defined.');
  }

  const filledUserPrompt = fillTemplate(prompts.GENERATE_ONTOLOGY.user, {
    domain,
    instructions,
  });
  const systemPrompt = prompts.GENERATE_ONTOLOGY.system;

  const generatedProlog = await generateContent({
    promptName: 'GENERATE_ONTOLOGY',
    systemPrompt,
    userPrompt: filledUserPrompt,
    llmProviderName,
    modelName,
  });

  let cleanedProlog = generatedProlog.replace(
    /```prolog\s*([\s\S]*?)\s*```/g,
    '$1'
  );
  cleanedProlog = cleanedProlog.replace(/```\s*([\s\S]*?)\s*```/g, '$1');
  cleanedProlog = cleanedProlog.trim();

  if (!cleanedProlog) {
    logger.warn('LLM generated empty Prolog content.');
    return;
  }

  // The writeGeneratedFile utility adds its own standard comment header.
  // For Prolog, the script-specific comment style is '%', so we prepend that here.
  const prologCommentHeader = `% Domain: ${domain}\n% Instructions: ${instructions}\n`;
  const fullContent = `${prologCommentHeader}\n${cleanedProlog}`;

  const fileName = `${domain.replace(/\s+/g, '_').toLowerCase()}GeneratedOntology.pl`;
  const filePath = path.join(ontologiesDir, fileName);

  ensureDirectoryExists(ontologiesDir);
  writeGeneratedFile({
    filePath,
    content: fullContent, // This content already includes the Prolog-style header
    domain, // Domain and instructions are still useful for metadata even if header is suppressed
    instructions,
    scriptName: SCRIPT_NAME,
    suppressDefaultHeader: true, // Suppress the default JS-style comment header
  });

  logger.info(`[${SCRIPT_NAME}] Successfully generated ontology.`);
}

if (require.main === module) {
  const scriptSpecificOptions = {
    domain: {
      alias: 'd',
      type: 'string',
      description:
        'The domain for which to generate the ontology (e.g., "biology", "space_exploration")',
      demandOption: true,
    },
    instructions: {
      alias: 'i',
      type: 'string',
      description:
        'Specific instructions for the content, source material, or style of the ontology',
      demandOption: true,
    },
  };
  const argv = setupGeneratorScript(scriptSpecificOptions, SCRIPT_NAME);

  createOntology(
    argv.domain,
    argv.instructions,
    argv.provider,
    argv.model
  ).catch((error) => {
    logger.error(`An error occurred in ${SCRIPT_NAME}: ${error.message}`);
    process.exit(1);
  });
}
