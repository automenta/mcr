// src/evaluation/metrics.js
const logger = require('../logger'); // Assuming logger is accessible via ../
const { fillTemplate, getPromptTemplateByName } = require('../prompts'); // Assuming prompts is accessible

// Helper for normalizeProlog, kept internal to this module
const normalizeSingleProlog = (code) => {
  if (typeof code !== 'string') return code;
  // Remove comments
  let norm = code.replace(/%.*?\n/g, '\n').replace(/%.*?$/, '');
  // Standardize whitespace: remove leading/trailing, collapse multiple spaces, space around operators
  norm = norm.trim().replace(/\s+/g, ' ');
  norm = norm.replace(/\s*([(),.:-])\s*/g, '$1'); // Space around operators, commas, parentheses
  norm = norm.replace(/([(),.:-])\s*([(),.:-])/g, '$1$2'); // Remove space between consecutive operators
  return norm;
};

const metrics = {
  exactMatchProlog: (actualProlog, expectedProlog) => {
    if (typeof actualProlog !== typeof expectedProlog) return false;
    if (Array.isArray(actualProlog)) {
      if (actualProlog.length !== expectedProlog.length) return false;
      return actualProlog.every((val, index) => val === expectedProlog[index]);
    }
    return actualProlog === expectedProlog;
  },

  exactMatchAnswer: (actualAnswer, expectedAnswer) => {
    if (typeof actualAnswer !== 'string' || typeof expectedAnswer !== 'string')
      return false;
    return actualAnswer.trim() === expectedAnswer.trim();
  },

  normalizeProlog: (prologCode) => {
    if (Array.isArray(prologCode)) {
      return prologCode.map(normalizeSingleProlog);
    }
    return normalizeSingleProlog(prologCode);
  },

  prologStructureMatch: (actualProlog, expectedProlog) => {
    const normActual = metrics.normalizeProlog(actualProlog);
    const normExpected = metrics.normalizeProlog(expectedProlog);
    return metrics.exactMatchProlog(normActual, normExpected);
  },

  semanticSimilarityAnswer: async (
    actualAnswer,
    expectedAnswer,
    llmGenerateFunc, // Expecting the LLM generation function to be passed in
    originalQuestion = ''
  ) => {
    if (
      typeof actualAnswer !== 'string' ||
      typeof expectedAnswer !== 'string' ||
      typeof llmGenerateFunc !== 'function'
    ) {
      logger.error(
        '[Metrics] semanticSimilarityAnswer called with invalid arguments or missing llmGenerateFunc.'
      );
      return false;
    }
    if (actualAnswer.trim() === expectedAnswer.trim()) return true;

    const similarityPromptTemplate = getPromptTemplateByName(
      'SEMANTIC_SIMILARITY_CHECK'
    );
    if (!similarityPromptTemplate) {
      logger.error(
        '[Metrics] SEMANTIC_SIMILARITY_CHECK prompt template not found!'
      );
      return false;
    }

    const systemPrompt = similarityPromptTemplate.system;
    const userPrompt = fillTemplate(similarityPromptTemplate.user, {
      text1: expectedAnswer,
      text2: actualAnswer,
      context: originalQuestion
        ? `The original question was: "${originalQuestion}"`
        : 'No specific question context provided.',
    });

    try {
      const response = await llmGenerateFunc(systemPrompt, userPrompt);
      logger.debug(
        `[Metrics] Semantic similarity LLM response: ${response.text || response}`
      ); // response might be an object or string
      const responseText =
        typeof response === 'object' && response.text
          ? response.text
          : String(response);
      return responseText.trim().toLowerCase().startsWith('similar');
    } catch (error) {
      logger.error(
        `[Metrics] Error during semantic similarity check: ${error.message}`
      );
      return false;
    }
  },
};

module.exports = metrics;
