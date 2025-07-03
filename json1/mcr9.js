/**
 * MCR-IX "Olympus" - Node.JS Proof-of-Concept
 * Version: 9.0.11-definitive-hardened
 *
 * This script is a single-file, non-interactive reimplementation of the core
 * logic from the Python MCR-IX "Olympus" application. It demonstrates the
 * "metacognitive" reasoning pipeline using langchain.js to connect to an
 * Ollama-hosted LLM and tau-prolog for symbolic reasoning.
 *
 * DEFINITIVE VERSION 9.0.11:
 *  - FIX: Radically overhauled the INTENT_CLASSIFIER prompt to prevent misclassification of facts as rules.
 *  - FIX: Rewrote the NL_TO_FACTS prompt to use a forceful, command-based structure to ensure correct list expansion and formatting.
 *  - FIX (CRITICAL): Implemented defensive post-processing in `_extractProlog` to programmatically normalize LLM output to lowercase, unquoted atoms. This acts as a firewall against LLM formatting errors, ensuring KB consistency.
 *  - This version represents the most robust and resilient implementation.
 *
 * To Run:
 * 1. Ensure you have an Ollama instance running and have pulled a model (e.g., `ollama pull llama3`).
 * 2. Install dependencies: `npm install langchain @langchain/core @langchain/ollama tau-prolog`
 * 3. Execute the script: `node mcr_olympus_poc.js`
 */

// --- DEPENDENCIES ---
const pl = require('tau-prolog');
const { ChatOllama } = require('@langchain/ollama');
const { StringOutputParser } = require('@langchain/core/output_parsers');

// --- CONFIGURATION & CONSTANTS ---
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ||
    'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q6_K_L';
    //"llamablit";
const VERSION = "9.0.11-definitive-hardened"; // <-- FIX: Version updated

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
        // --- FIX: Radically improved intent classifier prompt ---
        "INTENT_CLASSIFIER": `Your task is to classify a user's statement as either a FACT or a RULE. Respond with only one word.
- A FACT is a specific statement about named individuals or objects. It is a piece of data.
  - Examples: "Elizabeth is the parent of Charles.", "The ball is red.", "John, Mary, and Sue are friends."
- A RULE is a general definition or a logical implication that applies to variables, not specific individuals. It defines a concept.
  - Examples: "A grandparent is a parent of a parent.", "X is a sibling of Y if they share a parent."

Statement: "{text}"
Classification:`,
        // --- FIX: Hardened fact translation prompt with command structure ---
        "NL_TO_FACTS": `You are a Prolog translation engine. Follow these commands precisely.
1.  **COMMAND: SYNTAX.** All atoms (names, objects) MUST be lowercase. DO NOT use quotes. DO NOT use uppercase variables.
2.  **COMMAND: EXPANSION.** If a sentence lists multiple subjects or objects (e.g., "A and B are parents of C and D"), you MUST create a separate fact for each one. Never combine them. Missing a fact is a critical failure.
3.  **COMMAND: OUTPUT.** Only output the Prolog code. No explanations.

--- EXAMPLES ---
User: "Elizabeth and Philip are the parents of Charles and Anne."
Output:
parent(elizabeth, charles).
parent(elizabeth, anne).
parent(philip, charles).
parent(philip, anne).

User: "Philip, Charles, William, Harry, George are male."
Output:
male(philip).
male(charles).
male(william).
male(harry).
male(george).
--- END EXAMPLES ---

User: "{text}"
Output:`,
        "NL_TO_RULES": `You are an expert in translating natural language definitions into Prolog rules.
- Define a new predicate based on existing ones.
- Use uppercase variables for generalization (X, Y, P, etc.).
- Output ONLY a valid Prolog rule. Do not include explanations or markdown.

--- EXAMPLES ---
User: "A person's mother is their female parent."
Schema: parent/2, female/1
Output: mother(M, C) :- parent(M, C), female(M).

User: "A grandparent is the parent of a parent."
Schema: parent/2
Output: grandparent(GP, GC) :- parent(P, GC), parent(GP, P).
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
        const schema = kwargs.schema;
        const schema_section = schema && schema.length > 0
            ? `--- SCHEMA ---\n% The knowledge base currently has these predicates: ${schema.join(', ')}\n`
            : "";
        kwargs.schema_section = schema_section;

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
        this.llm = new ChatOllama({ baseUrl, model });
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

    // --- FIX: Implemented defensive post-processing to normalize LLM output ---
    _extractProlog(text) {
        const clauseRegex = /[a-z][a-zA-Z0-9_]*\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)\s*(?::-[^.]*)?\./g;
        let matches = text.match(clauseRegex) || [];

        // Normalize the output to enforce consistency as a defense against LLM errors.
        return matches.map(m =>
            m.trim()
                .replace(/\s+/g, ' ') // Standardize whitespace
                .toLowerCase() // CRITICAL: Enforce lowercase atoms
                .replace(/'([a-z0-9_]+)'/g, '$1') // Remove quotes from simple atoms
        );
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
                    if (content !== '' && content.match(/[a-zA-Z0-9_]/)) { // Check if there's actual content
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
        const llmResponse = await this.llm.generate(translationPrompt);

        const newClauses = this._extractProlog(llmResponse);
        log.info("Translated & Normalized Prolog clauses:", newClauses);

        const currentKbLines = new Set(session.knowledgeBase.split('\n').filter(l => l.trim()));
        const addedFacts = newClauses.filter(clause => !currentKbLines.has(clause));

        if (addedFacts.length > 0) {
            log.info(`Adding ${addedFacts.length} new clauses to the KB.`);
            session.knowledgeBase = (session.knowledgeBase + '\n' + addedFacts.join('\n')).trim();
        } else {
            log.warn("No new clauses were added. They might already exist or the LLM failed to translate/normalize.");
        }

        return { addedFacts, knowledgeBase: session.knowledgeBase, translatedProlog: newClauses, intent };
    }

    async runQuery(session, queryText) {
        log.info(`Starting query for text: "${queryText}"`);
        const schema = this._getKbSchema(session.knowledgeBase);
        log.debug("Current KB Schema:", schema);

        const queryPrompt = this.prompts.get("NL_TO_QUERY", { query: queryText, schema });
        const prologQueryRaw = await this.llm.generate(queryPrompt);
        const prologQuery = prologQueryRaw.trim().replace(/\.$/, '').toLowerCase();
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