### Refined Development Plan for Implementing Elegant Neurosymbolic MCR Redesign

This refined plan builds directly on the existing codebase (clone from https://github.com/automenta/mcr), reusing modularity (e.g., pluggable services in src/, WebSocket handlers, session stores, evolution components), while ensuring full coverage of the elegant model's features: config variants (LLM/reasoner OR/XOR), bridges/integration, hybrid session/KB persistence, bidirectional operations loops, guided probabilistic reasoning, optional UI/API enhancements, and loop-integrated evolution. Additions focus on symbiosis (embeddings, KG, LTN) without disrupting existing flows—e.g., fallback to current Prolog if LTN not configured. Use JavaScript/Node.js; add minimal npm deps for new features.

#### Step 1: Enhance Configuration for Full Variant Support
- In `config.js`: Expand .env parsing with `REASONER_TYPE` (default 'prolog', XOR: 'prolog' | 'ltn'), `EMBEDDING_MODEL` (optional, e.g., 'all-MiniLM-L6-v2'), `KG_ENABLED` (boolean, default false). Add validation: if 'ltn', require `LTN_THRESHOLD` (float 0-1 for prob cutoff); if embeddings, check model availability.
- In `.env.example`: Append new keys with examples, e.g., `REASONER_TYPE=ltn`, `EMBEDDING_MODEL=all-MiniLM-L6-v2`, `KG_ENABLED=true`, `LTN_THRESHOLD=0.7`.
- In `mcr.js`: On startup, conditionally load tfjs and graphology: add `if (config.EMBEDDING_MODEL) { const tf = require('@tensorflow/tfjs-node'); }` and similar for graphology if KG_ENABLED.

#### Step 2: Implement Neural-Symbolic Bridges for Integration
- Create `src/bridges/` directory.
- Add `src/bridges/embeddingBridge.js`: Class `EmbeddingBridge` with `async loadModel()` (load tfjs sentence-transformer model), `encode(text)` (return vector array), `similarity(vec1, vec2)` (cosine sim). Fallback to zero-vector if load fails.
- Add `src/bridges/kgBridge.js`: Class `KnowledgeGraph` using graphology: methods `addTriple(subj, pred, obj)`, `queryTriples(pattern)` (return matching triples), `embedNodes(embeddingBridge)` (vectorize nodes/edges), `toJSON()`/`fromJSON()` for persistence.
- In `src/llmService.js`: Extend `invokeLLM` to optionally append embeddings to prompts, e.g., if input.embed, add `prompt += `\nEmbeddings context: ${JSON.stringify(relevantVectors)}`;`.
- In `src/reasonerService.js`: Add LTN variant—conditional: if config.REASONER_TYPE === 'ltn', implement `probabilisticDeduce(clauses, query, threshold)` (weight clauses by embedding sim, filter proofs > threshold; use simple array-based weighting as LTN sim, integrate with existing Prolog resolver for base deduction).

#### Step 3: Hybridize Session and KB for Persistent State
- In `src/mcrService.js`: Update `Session` class—add `kbGraph` (KnowledgeGraph instance if KG_ENABLED), `embeddings` (Map<string, array> for clause vectors). In constructor: `if (config.KG_ENABLED) this.kbGraph = new KnowledgeGraph(); this.embeddings = new Map();`.
- In assert/query methods: After logic ops, if embeddings enabled, `this.embeddings.set(clauseId, embeddingBridge.encode(clause));` and if KG, parse clause to triples and add to kbGraph.
- In `InMemorySessionStore.js` and `FileSessionStore.js`: Modify save/load—add `sessionData.kbGraph = this.kbGraph ? this.kbGraph.toJSON() : null;` and `sessionData.embeddings = Array.from(this.embeddings);`. On load, reconstruct instances.

#### Step 4: Add Bidirectional Refinement Loops to Operations
- In `src/mcrService.js`: Introduce private `_refineLoop(input, type='nl_to_logic', maxIter=3)`: 
  1. Initial translate (use existing LLM/reasoner).
  2. Validate (consistency check via reasoner).
  3. If fail, refine: Query similar embeddings/KG triples, re-prompt LLM ("Refine for consistency: [issues], similar: [similars]").
  4. Loop until valid or max; log iterations.
- Refactor `kb.assert`: Wrap NL-to-logic in `_refineLoop`; add KG triple extraction if enabled.
- Refactor `kb.query`: Wrap logic-to-NL in reverse `_refineLoop` (symbolic result → embed → LLM interpret → validate sim).
- In `src/toolDefinitions.js`: Update KB tool schemas—add optional params `useLoops: boolean` (default true), `embed: boolean`, to trigger features.

#### Step 5: Upgrade Reasoning to Guided Loops with Probabilistic Outputs
- In `src/reasonerService.js`: Replace `deduce` with `guidedDeduce(query)`: 
  1. Neural guide: LLM generate/rank hypotheses (prompt with embeddings/KG context).
  2. Symbolic prove: Run deduction (Prolog or LTN) on top ranks.
  3. Probabilistic: Compute output { proof, probability: simScore * (1 / rank) } or LTN-weighted; filter by threshold.
- In `src/mcrService.js`: Hook `kb.query` to `guidedDeduce`; extend tool_result payload with `probabilities: array`, `loopIterations: number`.
- Fallback: If no embeddings/KG, use current deterministic mode with mock prob=1.0.

#### Step 6: Enhance Optional UI/API and Integrate Evolution into Cycles
- In `src/websocketHandlers.js`: Add tools `hybrid.refine` (explicit loop invoke, input: {type, data}), `kg.query` (if KG_ENABLED). Extend existing tools with loop/hybrid flags.
- In `ui/src/components/SessionChat.jsx`: Add cycle viz—e.g., accordion for loop steps, probability bars (use Recharts if added to ui/package.json).
- In `ui/src/components/AnalysisDashboard.jsx`: Extend with hybrid metrics (e.g., embedding sim histograms, prob distributions).
- For evolution: In `src/evolution/optimizer.js`, modify `optimizeStrategy` to `optimizeInLoop(strategy, inputCases)`—wrap evals in `_refineLoop` from mcrService; add embedding/KG metrics to perf DB schema (alter `performance_results.db` with new columns: embedding_sim float, prob_score float).

#### Step 7: Add Dependencies, Comprehensive Tests, and Final Cleanup
- In root `package.json`: Add `"@tensorflow/tfjs-node": "^4.20.0"`, `"@tensorflow-models/universal-sentence-encoder": "^1.3.3"`, `"graphology": "^0.25.4"`, `"recharts": "^2.12.7"` (for UI viz).
- In `ui/package.json`: Ensure Recharts if using for probs viz.
- In `tests/mcrService.test.js`: Add tests for hybrid session (mock bridges, assert embeddings set), loops (simulate iterations, check convergence).
- In `tests/reasonerService.test.js`: Test guidedDeduce variants (Prolog deterministic, LTN probabilistic with mocks).
- In `tests/evolution/optimizer.test.js`: Test loop-integrated optimization (include hybrid metrics).
- Run `npm install` in root and ui/.
- In README.md: Update features section with neurosymbolic additions (e.g., "Bidirectional loops, embeddings/KG support"); add config examples; include hybrid usage in examples.
- Remove any conflicting deprecated code if found (e.g., ensure no CLI remnants).

This ensures feature-completeness: all elegant model elements implemented, with fallbacks for optionals (e.g., disable KG via config). Test thoroughly post-changes; deploy via existing `node mcr.js`.
