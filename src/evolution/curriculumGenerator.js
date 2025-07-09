// src/evolution/curriculumGenerator.js
const crypto = require('crypto');
const logger = require('../../server/logger');
const { initDb } = require('../../server/database'); // closeDb removed
const llmService = require('../../server/services/llmService');
const { prompts, fillTemplate } = require('../../server/prompts');
const { loadAllEvalCases } = require('../evalCases/baseEvals'); // To get existing cases
const fs = require('fs');
const path = require('path');

class CurriculumGenerator {
  constructor(config = {}) {
    this.config = config;
    this.generatedCasesDir =
      config.generatedCasesDir ||
      path.join(__dirname, '..', 'evalCases', 'generated');
    if (!fs.existsSync(this.generatedCasesDir)) {
      fs.mkdirSync(this.generatedCasesDir, { recursive: true });
    }
  }

  /**
   * Identifies evaluation cases where strategies frequently fail or underperform.
   * @param {number} limit Max number of poor-performing cases to identify.
   * @returns {Promise<Array<object>>} Array of { example_id, total_runs, failure_rate, avg_score, sample_case_details }
   */
  async identifyPoorPerformingCases(limit = 5) {
    logger.info(
      '[CurriculumGenerator] Identifying poor-performing evaluation cases...'
    );
    try {
      const db = await initDb();
      // Query for example_ids that have a high failure rate on key metrics
      // For simplicity, let's count how many times an example_id had 'exactMatchProlog' = 0 (false)
      const rows = await new Promise((resolve, reject) => {
        const query = `
                    SELECT
                        example_id,
                        COUNT(*) as total_runs,
                        SUM(CASE WHEN json_extract(metrics, '$.exactMatchProlog') = 0 THEN 1 ELSE 0 END) as prolog_failures,
                        SUM(CASE WHEN json_extract(metrics, '$.exactMatchAnswer') = 0 THEN 1 ELSE 0 END) as answer_failures,
                        AVG(json_extract(metrics, '$.exactMatchProlog')) as avg_prolog_score,
                        AVG(json_extract(metrics, '$.exactMatchAnswer')) as avg_answer_score
                    FROM performance_results
                    WHERE json_extract(metrics, '$.exactMatchProlog') IS NOT NULL OR json_extract(metrics, '$.exactMatchAnswer') IS NOT NULL
                    GROUP BY example_id
                    HAVING (prolog_failures > 0 OR answer_failures > 0) -- Must have at least one failure
                    ORDER BY (CAST(prolog_failures AS REAL) / total_runs) DESC, total_runs DESC -- Order by failure rate, then by run count
                    LIMIT ?;
                `;
        db.all(query, [limit], (err, rows) => {
          if (err) {
            logger.error(
              `[CurriculumGenerator] Error querying poor-performing cases: ${err.message}`
            );
            return reject(err);
          }
          resolve(rows);
        });
      });

      if (!rows || rows.length === 0) {
        logger.info(
          '[CurriculumGenerator] No poor-performing cases found based on current criteria.'
        );
        return [];
      }

      // Enrich with actual case details
      const allEvalCases = loadAllEvalCases(); // Load from default path `src/evalCases`
      const evalCaseMap = new Map(allEvalCases.map((ec) => [ec.id, ec]));

      const enrichedCases = rows
        .map((row) => {
          const fullCase = evalCaseMap.get(row.example_id);
          if (fullCase) {
            return {
              exampleId: row.example_id,
              totalRuns: row.total_runs,
              prologFailures: row.prolog_failures,
              answerFailures: row.answer_failures,
              failureRateProlog:
                row.total_runs > 0 ? row.prolog_failures / row.total_runs : 0,
              avgPrologScore: row.avg_prolog_score,
              avgAnswerScore: row.avg_answer_score,
              sampleCaseDetails: {
                // Provide the original case for context to the LLM
                naturalLanguageInput: fullCase.naturalLanguageInput,
                inputType: fullCase.inputType,
                expectedProlog: fullCase.expectedProlog,
                expectedAnswer: fullCase.expectedAnswer,
                description: fullCase.description,
                tags: fullCase.tags || [],
              },
            };
          }
          return null;
        })
        .filter(Boolean);

      logger.info(
        `[CurriculumGenerator] Identified ${enrichedCases.length} poor-performing cases for variation.`
      );
      return enrichedCases;
    } catch (error) {
      logger.error(
        `[CurriculumGenerator] Error identifying poor-performing cases: ${error.message}`,
        { stack: error.stack }
      );
      return [];
    }
  }

  /**
   * Uses an LLM to generate variations of an existing evaluation case.
   * @param {object} originalCase The original EvaluationCase object (or its key details).
   * @param {number} numVariations Number of variations to generate.
   * @returns {Promise<Array<object>>} Array of new EvaluationCase-like objects.
   */
  async generateCaseVariations(originalCase, numVariations = 2) {
    if (!originalCase || !originalCase.naturalLanguageInput) {
      logger.warn(
        '[CurriculumGenerator] Original case data is insufficient for generating variations.'
      );
      return [];
    }

    // Use the GENERATE_EVAL_CASES prompt but with specific instructions for variation
    const generatePromptTemplate = prompts.GENERATE_EVAL_CASES;
    if (!generatePromptTemplate) {
      logger.error(
        '[CurriculumGenerator] GENERATE_EVAL_CASES template not found in prompts.js. Cannot generate variations.'
      );
      return [];
    }

    const domain = originalCase.tags
      ? originalCase.tags.find((t) => t.startsWith('domain_')) || 'general'
      : 'general';
    const instructions = `Generate ${numVariations} variations of the following evaluation case.
The variations should test the same underlying concept or knowledge but use different phrasing, complexity, or slightly altered scenarios.
Ensure the 'expectedProlog' and 'expectedAnswer' are accurate for each new variation.
Maintain the original inputType ('${originalCase.inputType}').
Base new IDs on the original: '${originalCase.exampleId}_var_N'.
Original Case Description: ${originalCase.description}
Original Natural Language Input: "${originalCase.naturalLanguageInput}"
Original Expected Prolog: ${JSON.stringify(originalCase.expectedProlog)}
Original Expected Answer: "${originalCase.expectedAnswer || ''}"
`;

    const userPrompt = fillTemplate(generatePromptTemplate.user, {
      domain: domain,
      instructions: instructions,
    });
    const systemPrompt = generatePromptTemplate.system;

    try {
      logger.info(
        `[CurriculumGenerator] Requesting LLM to generate ${numVariations} variations for case: ${originalCase.exampleId || originalCase.naturalLanguageInput}`
      );
      const llmResponse = await llmService.generate(systemPrompt, userPrompt);

      if (!llmResponse) {
        logger.warn(
          '[CurriculumGenerator] LLM returned empty response for case variations.'
        );
        return [];
      }

      let generatedCasesArray;
      try {
        // Response should be a JSON array string
        generatedCasesArray = JSON.parse(llmResponse);
        if (!Array.isArray(generatedCasesArray)) {
          logger.warn(
            '[CurriculumGenerator] LLM response for variations was not a JSON array. Response:',
            llmResponse.substring(0, 200)
          );
          return [];
        }
      } catch (parseError) {
        logger.error(
          `[CurriculumGenerator] Failed to parse LLM response as JSON array: ${parseError.message}. Response: ${llmResponse.substring(0, 500)}`
        );
        // Attempt to extract JSON from markdown code block if present
        const jsonMatch = llmResponse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            generatedCasesArray = JSON.parse(jsonMatch[1]);
            if (!Array.isArray(generatedCasesArray)) {
              logger.warn(
                '[CurriculumGenerator] Extracted content from markdown was not a JSON array.'
              );
              return [];
            }
            logger.info(
              '[CurriculumGenerator] Successfully parsed JSON from markdown block after initial failure.'
            );
          } catch (e) {
            logger.error(
              `[CurriculumGenerator] Failed to parse JSON from markdown block: ${e.message}`
            );
            return [];
          }
        } else {
          return [];
        }
      }

      // Validate and adapt generated cases (e.g., ensure unique IDs, add tags)
      const finalNewCases = [];
      for (const newCase of generatedCasesArray) {
        if (
          newCase &&
          newCase.id &&
          newCase.naturalLanguageInput &&
          newCase.inputType &&
          newCase.expectedProlog
        ) {
          // Ensure unique ID, perhaps by appending a hash or more robust suffix
          newCase.id =
            `${originalCase.exampleId}_var_${crypto.randomBytes(3).toString('hex')}_${newCase.id}`
              .replace(/[^a-zA-Z0-9_.-]/g, '_')
              .substring(0, 100);
          newCase.tags = [
            ...(originalCase.tags || []),
            'generated',
            'variation',
          ];
          newCase.notes =
            `Generated variation of ${originalCase.exampleId}. Original desc: ${originalCase.description}. ${newCase.notes || ''}`.substring(
              0,
              255
            );
          finalNewCases.push(newCase);
        } else {
          logger.warn(
            '[CurriculumGenerator] LLM generated an invalid case structure:',
            newCase
          );
        }
      }
      logger.info(
        `[CurriculumGenerator] LLM generated ${finalNewCases.length} valid case variations.`
      );
      return finalNewCases;
    } catch (error) {
      logger.error(
        `[CurriculumGenerator] LLM call for case variations failed: ${error.message}`,
        { stack: error.stack }
      );
      return [];
    }
  }

  /**
   * Main method to generate new curriculum content.
   * @returns {Promise<Array<object>>} Array of newly generated EvaluationCase objects.
   */
  async generate() {
    logger.info(
      '[CurriculumGenerator] Starting curriculum generation cycle...'
    );
    let allNewlyGeneratedCases = [];

    const poorCases = await this.identifyPoorPerformingCases(3); // Identify top 3 poor cases
    if (poorCases.length === 0) {
      logger.info(
        '[CurriculumGenerator] No poor-performing cases identified to base variations on. For now, generation will stop.'
      );
      // Future: Could implement other generation strategies here (e.g., from scratch based on domain gaps)
      return [];
    }

    for (const poorCase of poorCases) {
      const variations = await this.generateCaseVariations(
        poorCase.sampleCaseDetails,
        1
      ); // Generate 1 variation per poor case for now
      if (variations.length > 0) {
        allNewlyGeneratedCases.push(...variations);
        // Persist these new cases to files
        this.saveGeneratedCases(
          variations,
          `variations_of_${poorCase.exampleId}`
        );
      }
    }

    if (allNewlyGeneratedCases.length > 0) {
      logger.info(
        `[CurriculumGenerator] Successfully generated ${allNewlyGeneratedCases.length} new evaluation cases in total.`
      );
    } else {
      logger.info(
        '[CurriculumGenerator] No new evaluation cases were generated in this cycle.'
      );
    }

    return allNewlyGeneratedCases;
  }

  /**
   * Saves generated evaluation cases to a JSON file in the generatedCasesDir.
   * @param {Array<object>} casesArray Array of EvaluationCase objects.
   * @param {string} baseName A base name for the file (e.g., 'variations_BE001').
   */
  saveGeneratedCases(casesArray, baseName = 'generated_curriculum') {
    if (!casesArray || casesArray.length === 0) return;

    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, '-')
      .substring(0, 19);
    const fileName = `${baseName}_${timestamp}_${crypto.randomBytes(3).toString('hex')}.json`;
    const filePath = path.join(this.generatedCasesDir, fileName);

    try {
      fs.writeFileSync(filePath, JSON.stringify(casesArray, null, 2));
      logger.info(
        `[CurriculumGenerator] Saved ${casesArray.length} generated cases to: ${filePath}`
      );
    } catch (error) {
      logger.error(
        `[CurriculumGenerator] Error saving generated cases to ${filePath}: ${error.message}`
      );
    }
  }
}

module.exports = CurriculumGenerator;

/**
 * Example Usage (for testing):
async function testGenerator() {
    // Requires DB to be populated and LLM service configured.
    // Prompts.js must have GENERATE_EVAL_CASES template.
    await initDb();

    const generator = new CurriculumGenerator();
    const newCases = await generator.generate();

    if (newCases.length > 0) {
        console.log(`Generated ${newCases.length} new evaluation cases:`);
        // newCases.forEach(c => console.log(c));
        // Cases are automatically saved by the generate method via saveGeneratedCases.
    } else {
        console.log("No new cases were generated by the test.");
    }

    await closeDb();
}

if (require.main === module) {
    // testGenerator().catch(err => console.error("Test generator error:", err));
}
*/

// Make sure `prompts.js` has `GENERATE_EVAL_CASES` template.
// Example (to be added/verified in src/prompts.js, schema might need adjustment based on actual fields):
/*
GENERATE_EVAL_CASES: {
    name: 'GENERATE_EVAL_CASES',
    description: 'Generates new evaluation cases for NL to Logic system.',
    tags: ['curriculum', 'generation', 'internal'],
    system: `You are an expert AI assistant that generates evaluation cases for a Natural Language to Logic system.
Your output MUST be a single JSON array of "EvaluationCase" objects.
Each "EvaluationCase" object MUST adhere to the following JSON schema:
\`\`\`json
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "description": "Unique identifier (e.g., 'domain_concept_01')." },
    "description": { "type": "string", "description": "What this case tests." },
    "naturalLanguageInput": { "type": "string" },
    "inputType": { "type": "string", "enum": ["assert", "query"] },
    "expectedProlog": { "type": ["string", "array"], "items": {"type": "string"}, "description": "Prolog fact/rule(s) or query. Must end with a period." },
    "expectedAnswer": { "type": "string", "description": "NL answer for queries (optional)." },
    "metrics": { "type": "array", "items": {"type": "string"}, "default": ["exactMatchProlog"] },
    "notes": { "type": "string", "description": "Optional notes." },
    "tags": { "type": "array", "items": {"type": "string"}, "description": "Categorization tags." }
  },
  "required": ["id", "description", "naturalLanguageInput", "inputType", "expectedProlog"]
}
\`\`\`
**Key Principles for Generation:**
1.  **Domain & Instructions:** Adhere to the specified DOMAIN and INSTRUCTIONS.
2.  **Variety & Correctness:** Create diverse cases (assertions, queries, facts, rules, negations). Ensure \`expectedProlog\` is valid Prolog (clauses end with '.'). For multiple clauses from one assert, \`expectedProlog\` is an array.
3.  **Prolog Style:** Use lowercase_snake_case for predicates/constants. Variables: ALL_CAPS or underscore-prefixed.
    *   Membership: \`is_a(instance, class).\`
    *   Definitions: \`defines(common_name, symbol).\`
    *   Relations: \`relation(subject, object).\`
    *   Composition: \`is_composed_of(entity, [components]).\`
    *   Attributes: \`attribute(entity, value).\`
4.  **Output:** ONLY the JSON array. No other text.`,
    user: `DOMAIN: "{{domain}}"
INSTRUCTIONS: "{{instructions}}"

Generate a JSON array of EvaluationCase objects based on the DOMAIN and INSTRUCTIONS. Ensure Prolog syntax is correct.

JSON Array Output:`,
    expectedFormat: 'json_array',
    version: '1.0'
}
*/
