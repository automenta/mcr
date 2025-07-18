# Phased Development Plan for MCR 2.0

This plan outlines a step-by-step transformation of the existing codebase into the MCR 2.0 design, focusing exclusively on code modifications, creations, deletions, and integrations. It assumes the current structure includes root files like mcr.js, generate_example.js, generate_ontology.js; src/ with config.js, logger.js, llmService.js, reasonerService.js, mcrService.js, sessionStore.js, websocketHandlers.js, mcpHandler.js, and subdirs like evolution/ (curriculumGenerator.js, keywordInputRouter.js, optimizer.js, strategyEvolver.js), evalCases/generated/, llmProviders/, ontologies/; separate strategies/ dir with translation strategy files; providers/ for abstracts and implementations; ui/src/ for Workbench components; and tests/ for Jest tests. Phases build incrementally, with each ending in a testable state where possible.

## Phase 1: Cleanup and Preparation
- Delete deprecated root files: Remove cli.js, chat.js, and demo.js entirely.
- In mcr.js (server startup script), remove any references or imports related to deleted files (e.g., CLI/demo integrations).
- In src/mcrService.js, comment out or remove direct calls to deprecated components if present.
- Create a new file src/mcrEngine.js with an empty class `MCREngine` exported as module; add basic constructor that loads config from .env using dotenv and validates essential settings (e.g., API keys, storage type) via a simple try-catch block ported from config.js.
- Update package.json to ensure no references to removed files in scripts or dependencies; conditionally load LLM SDKs based on config (e.g., if(process.env.LLM_PROVIDER === 'openai') require('@openai/openai')) to minimize always-loaded deps.
- In src/logger.js, simplify to console-based with optional file output using fs, and export as a module for later integration.

## Phase 2: Consolidate Core Services into Unified Engine
- In src/mcrEngine.js, add session management: Port code from sessionStore.js to create a `sessions` Map (for in-memory) and methods like `getSession(id)`, `updateSession(id, data)`, `createSession()`; add file-based persistence option using fs to read/write JSON files in .sessions/, toggled via config.
- Merge LLM integration: Move code from llmService.js into `MCREngine` methods like `callLLM(prompt, options)`; use provider interface from providers/ to abstract calls, defaulting to OpenAI; retain passthrough via a `passthroughLLM(input)` method.
- Merge reasoner integration: Port from reasonerService.js to methods like `assertClauses(kb, clauses)`, `queryProlog(kb, query)` using tau-prolog; wrap in functional style with immutable KB updates.
- Merge business logic: Port from mcrService.js to methods like `handleInput(sessionId, input)` which orchestrates translation and reasoning; initially use existing strategies by requiring them dynamically.
- Delete src/llmService.js, src/reasonerService.js, src/mcrService.js, and src/sessionStore.js after verifying migrations; update imports in mcr.js to use `MCREngine` instance.
- In src/mcrEngine.js, add centralized error handling: Wrap key methods in try-catch, logging errors via the integrated logger and prompting LLM for fixes in hybrid cases.
- Update src/config.js to a simple export object if needed, but fold most into `MCREngine` constructor; delete config.js if fully merged.

## Phase 3: Implement Hybrid Execution Engine (HEE) and Hybrid Loop
- In src/mcrEngine.js, add HEE as a method `executeProgram(sessionId, program)` where `program` is an array of ops (JS objects like `{ op: 'neural', prompt: '...', outputVar: 'var' }`, `{ op: 'symbolic', query: '...', bindingsVar: 'var' }`, `{ op: 'hybrid', inputVar: 'var', refine: true }`); use async generators to yield results for streaming.
- Implement op execution: For 'neural', call LLM; for 'symbolic', query/assert Prolog; for 'hybrid', chain them with refinement logic.
- Add Context Graph as a session property: A plain JS object `{ facts: [], rules: [], embeddings: {}, models: {} }` for shared state; update methods to read/write immutably (e.g., return new graph copies).
- Implement Hybrid Loop as a utility function in `executeProgram`: For refinement ops, iterate LLM generate → Prolog evaluate → LLM refine (using feedback like "Fix: [error]") until convergence (e.g., no errors or max iterations); integrate bidirectional fusion by exporting KB to prompts and asserting LLM outputs as soft rules.
- Add embedding support: If LLM provider allows, compute embeddings in neural ops and store in Context Graph for semantic query routing (e.g., similarity checks before Prolog queries).
- Update `handleInput` to construct and run a default HEE program for standard queries (e.g., translate → query → refine).
- In src/mcrEngine.js, add probabilistic reasoning: In hybrid ops, combine LLM confidence scores with Prolog results (e.g., weight soft facts).

## Phase 4: Integrate Bi-Level Translation Strategy
- If not present, create dir strategies/ (or use existing); add new file strategies/BiLevelAdaptive.js exporting a function `translateToLogic(input, sessionId)` with upper level LLM prompt to generate JSON model `{ p: '...', t: '...', V: [], C: [], O: '...' }`, then lower level prompt to produce Prolog clauses from the model; return `{ clauses, intermediateModel }`.
- In src/mcrEngine.js, update translation pipeline: Add `getStrategy(input)` using keywordInputRouter.js logic (port if needed) to select strategies, prioritizing BiLevelAdaptive for tasks with keywords like "solve", "constraints"; store intermediates in session Context Graph.
- Enhance `assertNaturalLanguage(sessionId, input)` (from merged mcrService): Use selected strategy, assert clauses to KB, push model to session.intermediates.
- Add dynamic lexicon: In translation functions, generate predicate summaries from KB on-the-fly and append to prompts.
- Update existing strategies (e.g., basic.js, SIR.js if present) to optional composable steps in BiLevelAdaptive for backward compatibility.

## Phase 5: Create and Enhance Evolution Module
- Create src/evolutionModule.js by merging code from evolution/ files: Port curriculumGenerator.js to `generateCurriculum(cases)`, keywordInputRouter.js to `selectStrategy(input, perfData)`, optimizer.js and strategyEvolver.js to `optimizeStrategies()` and `mutateStrategy(name, examples)`.
- In evolutionModule.js, implement bilevel optimization: Treat upper/lower as sub-components; in `optimizeStrategies()`, for 'BiLevelAdaptive', mutate prompts separately, evaluate jointly on cases using rewards (1 for successful Prolog resolution vs. ground truth); apply GRPO-inspired clipping (e.g., group evaluations, update if average > threshold).
- Integrate as optional mode: Add `evolve(sessionId, input)` in src/mcrEngine.js that calls evolutionModule if config flag enabled; trigger inline during hybrid loops if refinements fail > N times, using failures as examples.
- Make evolution self-contained: Store performance in simple session perfData object or file (using fs), generate curricula via LLM calls if needed.
- Delete src/evolution/ dir and files after migration.

## Phase 6: Streamline WebSocket API Layer
- Rename or replace src/websocketHandlers.js with src/websocketApi.js; simplify to a single handler function with switch on `msg.type === 'invoke'` and `msg.tool`, dispatching to mcrEngine methods (e.g., 'mcr.handle' → handleInput).
- Merge src/mcpHandler.js into websocketApi.js if separate; retain tools like 'llm.passthrough', 'kb.import/export' as dispatched functions.
- Update message structure to flatter pattern; add real-time streaming via async generators in handlers (e.g., yield op results).
- In mcr.js, update server setup to use new websocketApi.js for handling connections.
- Delete src/mcpHandler.js and src/toolDefinitions.js if redundant after merge.

## Phase 7: Update MCR Workbench UI
- In ui/src/, simplify components: Reduce hooks by using direct WebSocket subscriptions for live updates (e.g., KB view subscribes to session changes).
- Add visualizations: Create new components like HybridLoopViewer.jsx to display step-by-step ops (e.g., render program array as timeline) and BiLevelModelDisplay.jsx to show JSON intermediates as formatted tables.
- Fold deprecated functionalities: Integrate any remaining CLI/demo logic into UI routes (e.g., chat mode as tab, ontology loading via button calling generate_ontology.js).
- Update main app component to use tabs for Interactive Session Mode (chat, KB, demos) and System Analysis Mode (dashboards for perf, evolver controls calling evolutionModule).
- Ensure all comms via WebSocket with the new invoke pattern; add error display tied to centralized handling.

## Phase 8: Integrate Utility Scripts
- Move generate_example.js and generate_ontology.js to src/utility.js as exported functions `generateExample()`, `generateOntology(domain)`.
- In src/mcrEngine.js, add methods to call utilities (e.g., `generateCurriculumViaUtility()` wrapping generate_example for evolution).
- Make utilities API-callable: Expose via WebSocket tools (e.g., 'util.generate_example') in websocketApi.js.
- In ui/src/, add buttons/controls to invoke utilities (e.g., demo runner calls generate_ontology).
- Delete original root utility files after move.

## Phase 9: Testing and Final Integration
- In tests/, update existing Jest tests to cover new mcrEngine.js methods (e.g., test handleInput with mock LLM/Prolog, HEE program execution, bi-level translation).
- Add new tests: For HEE (mock ops chain), Hybrid Loop (iteration convergence), bilevel evolution (reward-based updates), Context Graph immutability.
- In src/mcrEngine.js, add end-to-end test helpers (e.g., mock providers).
- In mcr.js, instantiate MCREngine and ensure server starts with all components; add config flag for evolution mode.
- Update OVERVIEW.md and WEBSOCKET_API.md in root to reflect new architecture, API patterns, and features (code-only: treat as code comments if not markdown).
- Run full test suite; iteratively fix any breakage from consolidations.
