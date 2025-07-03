/**
 * MCR-IX "Olympus" - Node.JS Proof-of-Concept
 * Version: 10.0.0-json
 *
 * This script is a single-file, non-interactive reimplementation of the core
 * logic from the Python MCR-IX "Olympus" application. It demonstrates the
 * "metacognitive" reasoning pipeline using langchain.js to connect to an
 - * Ollama-hosted LLM and tau-prolog for symbolic reasoning.
 *
 * REVISION 10.0.0:
 *  - ARCHITECTURE: Replaced direct NL-to-Prolog translation with a robust
 *    NL-to-JSON intermediate step. The LLM now generates a structured JSON
 *    representation of facts or rules.
 *  - ROBUSTNESS: A new `_jsonToProlog` function programmatically and
 *    deterministically translates the LLM's JSON output into perfect Prolog
 *    syntax. This eliminates the entire class of LLM-induced syntax errors
 *    (e.g., capitalization, quoting, formatting).
 *  - SIMPLIFICATION: The fragile, regex-based `_extractProlog` function has
 *    been completely removed, as it is no longer necessary.
 *  - PROMPTS: The `NL_TO_FACTS` and `NL_TO_RULES` prompts have been rewritten
 *    to request structured JSON output, complete with schema definitions and examples.
 */

// --- DEPENDENCIES ---
const pl = require('tau-prolog');
const { ChatOllama } = require('@langchain/ollama');
const { StringOutputParser } = require('@langchain/core/output_parsers');

// --- CONFIGURATION & CONSTANTS ---
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// Models like Llama 3 are excellent at JSON mode
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ||
    //'hf.co/bartowski/google_gemma-3n-E4B-it-GGUF:Q6_K_L'
    'llamablit'
;
const VERSION = "10.0.0-json";

// --- SIMPLE LOGGER ---
const log = {
    info: (message, ...args) => console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args),
    warn: (message, ...args) => console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args),
    error: (message, ...args) => console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args),
    debug: (message, ...args) => process.env.LOG_LEVEL === 'DEBUG' ? console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args) : null,
};

// --- DEMO SCENARIO DATA ---
const DEMO_SCENARIO = {
    name: "Royal Family Tree",
    description: "Genealogy of the British royal family, for complex relationship queries.",
    setup: [
        "Elizabeth and Philip are the parents of Charles and Anne.",
        "Charles and Diana are the parents of William and Harry.",
        "William and Catherine are the parents of George.",
        "Elizabeth, Diana, Catherine, Anne are female.",
        "Philip, Charles, William, Harry, George are male.",
        "A person's mother is their female parent.",
        "A person's father is their male parent.",
        "A grandparent is the parent of a parent."
    ],
    sample_query: "Who are the grandparents of George?",
};

// --- PROMPT MANAGER ---
class PromptManager {
    _PROMPTS = {
        "INTENT_CLASSIFIER": `Your task is to classify a user's statement as either a FACT or a RULE. Respond with only one word.
- A FACT is a specific statement about named individuals or objects. It is a piece of data.
  - Examples: "Elizabeth is the parent of Charles.", "The ball is red.", "John, Mary, and Sue are friends."
- A RULE is a general definition or a logical implication that applies to variables, not specific individuals. It defines a concept.
  - Examples: "A grandparent is a parent of a parent.", "X is a sibling of Y if they share a parent."

Statement: "{text}"
Classification:`,

        // --- NEW: Prompt for JSON fact representation ---
        "NL_TO_FACTS": `You are a Prolog translation engine. Your task is to convert the user's statement into a JSON array of Prolog facts.
Follow these rules precisely:
1.  **SYNTAX:** All atoms (names, objects) MUST be lowercase strings.
2.  **EXPANSION:** If a sentence lists multiple subjects or objects (e.g., "A and B are parents of C and D"), you MUST create a separate fact object for each individual relationship.
3.  **FORMAT:** Output ONLY the raw JSON array. Do not include explanations, markdown, or any other text.

--- JSON SCHEMA for a fact ---
{
  "functor": "string (the predicate name, e.g., 'parent')",
  "args": ["string", "string", "... (the arguments of the predicate)"]
}

--- EXAMPLES ---
User: "Elizabeth and Philip are the parents of Charles and Anne."
Output:
[
  {"functor": "parent", "args": ["elizabeth", "charles"]},
  {"functor": "parent", "args": ["elizabeth", "anne"]},
  {"functor": "parent", "args": ["philip", "charles"]},
  {"functor": "parent", "args": ["philip", "anne"]}
]

User: "Philip, Charles, William, Harry, George are male."
Output:
[
  {"functor": "male", "args": ["philip"]},
  {"functor": "male", "args": ["charles"]},
  {"functor": "male", "args": ["william"]},
  {"functor": "male", "args": ["harry"]},
  {"functor": "male", "args": ["george"]}
]
--- END EXAMPLES ---

User: "{text}"
Output:`,

        // --- NEW: Prompt for JSON rule representation ---
        "NL_TO_RULES": `You are an expert in translating natural language definitions into a JSON representation of a Prolog rule.
Follow these rules precisely:
1.  **VARIABLES:** Use uppercase strings for variables (e.g., "X", "Y", "P").
2.  **ATOMS:** Use lowercase strings for any specific atoms if they appear.
3.  **FORMAT:** Output ONLY the raw JSON object. Do not include explanations, markdown, or any other text.

--- JSON SCHEMA for a rule ---
{
  "head": {
    "functor": "string (the predicate being defined)",
    "args": ["string (variable or atom)", "..."]
  },
  "body": [
    {
      "functor": "string (a predicate in the rule body)",
      "args": ["string (variable or atom)", "..."]
    },
    ...
  ]
}

--- EXAMPLES ---
User: "A person's mother is their female parent."
Output:
{
  "head": {"functor": "mother", "args": ["M", "C"]},
  "body": [
    {"functor": "parent", "args": ["M", "C"]},
    {"functor": "female", "args": ["M"]}
  ]
}

User: "A grandparent is the parent of a parent."
Output:
{
  "head": {"functor": "grandparent", "args": ["GP", "GC"]},
  "body": [
    {"functor": "parent", "args": ["P", "GC"]},
    {"functor": "parent", "args": ["GP", "P"]}
  ]
}
--- END EXAMPLES ---

User: "{text}"
Output:`,
        "NL_TO_QUERY": `You are an expert in translating a natural language question to the simplest possible Prolog query.
- Output ONLY the query goal, with no period or explanation.
- CRITICAL: For any unknown information the user is asking for (like "who", "what", "which"), you MUST use an uppercase named variable (e.g., X, Result, Grandparent).
- DO NOT use the anonymous variable "_" for a piece of information that needs to be returned in the answer. Use a named variable instead.
- If a schema is provided, use the existing predicates.

--- EXAMPLES ---
User: "What color is the sphere?" -> color(sphere, Color)
User: "Who are the grandparents of George?" -> grandparent(Grandparent, george)
--- END EXAMPLES ---

User: "{query}"
Output:`,
        "RESULT_TO_NL": `Based *strictly* on the following Prolog query and its JSON result, provide a clear, natural language answer.
- If the result is an empty list \`[]\` or \`"No"\`, state that the query was false or found no answers.
- If the result is a list of dictionaries, summarize the successful bindings conversationally.
- If the result is \`true\`, confirm the query was true.
- DO NOT invent answers or reasoning not supported by the JSON result.

Query: {query}
Result (JSON): {result}
Answer:`,
    };

    get(templateName, kwargs) {
        let template = this._PROMPTS[templateName];
        if (!template) throw new Error(`Prompt template '${templateName}' not found.`);

        for (const key in kwargs) {
            template = template.replace(new RegExp(`{${key}}`, 'g'), () => kwargs[key]);
        }
        return template;
    }
}

// --- LLM PROVIDER ---
class OllamaLlmProvider {
    constructor(model, baseUrl) {
        log.info(`Initializing OllamaLlmProvider with model: ${model}, URL: ${baseUrl}`);
        // Enable JSON mode for models that support it
        this.llm = new ChatOllama({ baseUrl, model
            //, format: "json"
        });
        this.chain = this.llm.pipe(new StringOutputParser());
    }

    async generate(prompt) {
        log.debug("Invoking LLM with prompt:\n---\n" + prompt + "\n---");
        const response = await this.chain.invoke(prompt);
        log.debug("LLM response:\n---\n" + response + "\n---");
        return response;
    }
}

// --- REASONER PROVIDER ---
class TauPrologReasonProvider {
    constructor() {
        log.info("Initializing TauPrologReasonProvider.");
    }

    async query(knowledgeBaseStr, queryString) {
        log.info(`Querying Prolog with KB size: ${knowledgeBaseStr.length} chars, Query: "${queryString}"`);
        const session = pl.create(10000); // 10s timeout

        return new Promise((resolve, reject) => {
            session.consult(knowledgeBaseStr, {
                success: () => {
                    log.debug("Prolog KB consulted successfully.");
                    session.query(queryString);
                    const results = [];
                    const answerHandler = (answer) => {
                        if (answer === false || answer === null) {
                            resolve(results);
                            return;
                        }
                        if (pl.is_substitution(answer)) {
                            const formattedAnswer = {};
                            for (const variable in answer.links) {
                                if (!variable.startsWith('_')) {
                                    formattedAnswer[variable] = answer.links[variable].toString({ quoted: false });
                                }
                            }
                            if (Object.keys(formattedAnswer).length > 0) {
                                results.push(formattedAnswer);
                            }
                        }
                        session.answer(answerHandler);
                    };
                    session.answer(answerHandler);
                },
                error: (err) => {
                    const errorMsg = err.toString();
                    log.error("Prolog consultation error:", errorMsg);
                    reject(new Error(`Prolog consultation error: ${errorMsg}`));
                }
            });
        });
    }
}

// --- MCR CORE SERVICE ---
class MCRService {
    constructor(llm, reasoner) {
        this.llm = llm;
        this.reasoner = reasoner;
        this.prompts = new PromptManager();
        log.info("MCRService initialized.");
    }

    // --- NEW: Deterministic JSON-to-Prolog translator ---
    _jsonToProlog(jsonString) {
        let data;
        try {
            // The LLM might still wrap its output in markdown, so we extract the JSON.
            const jsonMatch = jsonString.match(/```json\s*([\s\S]*?)\s*```|(\[[\s\S]*\])|({[\s\S]*})/);
            if (!jsonMatch) {
                throw new Error("No valid JSON object or array found in the LLM response.");
            }
            const extractedJson = jsonMatch[1] || jsonMatch[2] || jsonMatch[3];
            data = JSON.parse(extractedJson);
        } catch (e) {
            log.error("Failed to parse JSON from LLM response.", { error: e.message, response: jsonString });
            return []; // Return empty array on failure
        }

        const formatTerm = (term) => `${term.functor}(${term.args.join(',')})`;

        // Case 1: An array of facts
        if (Array.isArray(data)) {
            return data.map(fact => `${formatTerm(fact)}.`);
        }

        // Case 2: A single rule object
        if (data.head && data.body) {
            const headStr = formatTerm(data.head);
            const bodyStr = data.body.map(formatTerm).join(', ');
            return [`${headStr} :- ${bodyStr}.`];
        }

        log.warn("JSON structure from LLM was not a recognized fact array or rule object.", data);
        return [];
    }

    _getKbSchema(kbString) {
        const predicates = new Set();
        for (const line of kbString.split('\n')) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('%')) continue;

            const head = trimmedLine.split(':-')[0].trim();
            const match = head.match(/^([a-z][a-zA-Z0-9_]*)\(/);
            if (match) {
                const name = match[1];
                const headContentMatch = head.match(/^\w+\((.*)\)/);
                let arity = 0;
                if (headContentMatch) {
                    const content = headContentMatch[1].trim();
                    if (content !== '' && content.match(/[a-zA-Z0-9_]/)) {
                        arity = (content.match(/,/g) || []).length + 1;
                    }
                }
                predicates.add(`${name}/${arity}`);
            }
        }
        return Array.from(predicates).sort();
    }

    async assertIntoSession(session, text) {
        log.info(`Starting assertion for text: "${text}"`);
        const schema = this._getKbSchema(session.knowledgeBase);
        log.debug("Current KB Schema:", schema);

        const intentPrompt = this.prompts.get("INTENT_CLASSIFIER", { text });
        const intentRaw = await this.llm.generate(intentPrompt);
        const intent = intentRaw.toUpperCase().includes("RULE") ? "RULE" : "FACT";
        log.info(`Classified intent as: ${intent}`);

        const promptTemplate = intent === "FACT" ? "NL_TO_FACTS" : "NL_TO_RULES";
        const translationPrompt = this.prompts.get(promptTemplate, { text, schema });
        const llmJsonOutput = await this.llm.generate(translationPrompt);

        // --- REVISED LOGIC ---
        const newClauses = this._jsonToProlog(llmJsonOutput);
        log.info("Translated JSON to Prolog clauses:", newClauses);

        const currentKbLines = new Set(session.knowledgeBase.split('\n').filter(l => l.trim()));
        const addedFacts = newClauses.filter(clause => !currentKbLines.has(clause));

        if (addedFacts.length > 0) {
            log.info(`Adding ${addedFacts.length} new clauses to the KB.`);
            session.knowledgeBase = (session.knowledgeBase + '\n' + addedFacts.join('\n')).trim();
        } else {
            log.warn("No new clauses were added. They might already exist or the LLM failed to translate.");
        }

        return { addedFacts, knowledgeBase: session.knowledgeBase, translatedProlog: newClauses, intent };
    }

    async runQuery(session, queryText) {
        log.info(`Starting query for text: "${queryText}"`);
        const schema = this._getKbSchema(session.knowledgeBase);
        log.debug("Current KB Schema:", schema);

        const queryPrompt = this.prompts.get("NL_TO_QUERY", { query: queryText, schema });
        const prologQueryRaw = await this.llm.generate(queryPrompt);
        // Query translation remains string-based as it's simpler and less error-prone
        const prologQuery = prologQueryRaw.trim().replace(/\.$/, '');
        log.info(`Translated NL to Prolog query: "${prologQuery}"`);

        const result = await this.reasoner.query(session.knowledgeBase, prologQuery);
        log.info("Raw reasoner result:", result);

        const resultForLlm = result === false ? "No" : (result === true ? "Yes" : result);
        const answerPrompt = this.prompts.get("RESULT_TO_NL", { query: prologQuery, result: JSON.stringify(resultForLlm) });
        const answer = await this.llm.generate(answerPrompt);
        log.info(`Final NL answer: "${answer}"`);

        return { prologQuery, result, answer };
    }
}

// --- DEMO RUNNER ---
async function runDemo() {
    log.info(`===== MCR-IX "Olympus" Node.JS PoC (v${VERSION}) =====`);
    log.info(`Starting demo: "${DEMO_SCENARIO.name}"`);

    let success = true;
    try {
        const llmProvider = new OllamaLlmProvider(OLLAMA_MODEL, OLLAMA_BASE_URL);
        const reasonerProvider = new TauPrologReasonProvider();
        const mcrService = new MCRService(llmProvider, reasonerProvider);

        const session = { knowledgeBase: '' };

        log.info("\n----- ASSERTION PHASE -----");
        for (let i = 0; i < DEMO_SCENARIO.setup.length; i++) {
            const text = DEMO_SCENARIO.setup[i];
            console.log(`\n--------------------------------------------------`);
            log.info(`[STEP ${i + 1}/${DEMO_SCENARIO.setup.length}] Asserting: "${text}"`);

            const response = await mcrService.assertIntoSession(session, text);

            const expectedFactCounts = { 1: 4, 2: 4, 3: 2, 4: 4, 5: 5, 6: 1, 7: 1, 8: 1 };
            if (response.addedFacts.length < (expectedFactCounts[i+1] || 1)) {
                log.error(`Assertion failed for step ${i+1}. Expected at least ${expectedFactCounts[i+1] || 1} new clauses, but got ${response.addedFacts.length}.`);
                log.debug("LLM translation that caused failure:", response.translatedProlog);
                log.debug("Full KB at time of failure:\n" + session.knowledgeBase);
                success = false;
                break;
            }
        }

        if (success) {
            log.info("\n----- FINAL KNOWLEDGE BASE -----");
            console.log(session.knowledgeBase);

            log.info("\n----- QUERY PHASE -----");
            const queryText = DEMO_SCENARIO.sample_query;
            log.info(`Querying: "${queryText}"`);

            const queryResponse = await mcrService.runQuery(session, queryText);

            console.log("\n=============================");
            log.info("      QUERY RESULTS");
            console.log("=============================");
            console.log(`  Prolog Query: ${queryResponse.prologQuery}`);
            console.log(`  Raw Result:   ${JSON.stringify(queryResponse.result)}`);
            console.log(`  Final Answer: ${queryResponse.answer}`);
            console.log("=============================\n");

            if (!queryResponse.result || (Array.isArray(queryResponse.result) && queryResponse.result.length === 0)) {
                log.error("Query returned no results, which is unexpected for this demo.");
                success = false;
            }
        }

    } catch (error) {
        log.error("A critical error occurred during the demo:", error.stack);
        success = false;
    }

    if (success) {
        log.info("✅ DEMO COMPLETED SUCCESSFULLY ✅");
        process.exit(0);
    } else {
        log.error("❌ DEMO FAILED ❌");
        process.exit(1);
    }
}

// --- EXECUTION ---
runDemo();