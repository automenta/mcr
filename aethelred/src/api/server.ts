import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';

import { McrOrchestrator, McrOrchestratorConfig } from '../core/orchestration/McrOrchestrator';
import { WorkflowExecutor, WorkflowExecutionContext, ProgrammaticTransformerRegistry } from '../core/workflow/WorkflowExecutor';
import { NullLlmProvider } from '../providers/NullLlmProvider';
import { OllamaLlmProvider, OllamaConfig } from '../providers/OllamaLlmProvider';
import { GeminiLlmProvider, GeminiConfig } from '../providers/GeminiLlmProvider';
import { TauPrologReasonProvider } from '../providers/TauPrologReasonProvider';
import { DirectS1Strategy } from '../strategies/DirectS1Strategy';
// import { SIRR1Strategy } from '../strategies/SIRR1Strategy'; // Import when ready
import type { ITranslationStrategy } from '../interfaces/ITranslationStrategy';
import type { ILlmProvider } from '../interfaces/ILlmProvider';

// Configuration (ideally from .env or a config file)
// TODO: Load these from environment variables or a config file
const MCR_LLM_PROVIDER = process.env.MCR_LLM_PROVIDER || 'null'; // 'ollama', 'gemini', or 'null'
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash-latest';
const DEFAULT_STRATEGY_NAME = 'DirectS1'; // Or load from config

// --- Initialize Providers ---
let llmProvider: ILlmProvider;
switch (MCR_LLM_PROVIDER.toLowerCase()) {
  case 'ollama':
    llmProvider = new OllamaLlmProvider({ baseURL: OLLAMA_BASE_URL, model: OLLAMA_MODEL });
    break;
  case 'gemini':
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is required for GeminiLlmProvider");
    llmProvider = new GeminiLlmProvider({ apiKey: GEMINI_API_KEY, model: GEMINI_MODEL });
    break;
  default: // 'null' or any other value
    console.log("Using NullLlmProvider. Set MCR_LLM_PROVIDER to 'ollama' or 'gemini' to use real LLMs.");
    const nullProvider = new NullLlmProvider("Default Null LLM Provider Response.");
    // Configure some default responses for NullLlmProvider for basic testing
    nullProvider.setResponseForPrompt(
        `Translate the following text to Prolog clauses:\n\n"Socrates is a man."`,
        "man(socrates)."
    );
    nullProvider.setResponseForPrompt(
        `Translate the following question to a Prolog query:\n\n"Is Socrates a man?"`,
        "man(socrates)."
    );
    llmProvider = nullProvider;
}

const reasonProvider = new TauPrologReasonProvider();

// --- Initialize WorkflowExecutor ---
// TODO: Register actual programmatic transformers if SIRR1Strategy or others need them
const programmaticTransformers: ProgrammaticTransformerRegistry = new Map();

const workflowExecutionContext: WorkflowExecutionContext = {
  llmProvider,
  reasonProvider,
  programmaticTransformers,
};
const workflowExecutor = new WorkflowExecutor(workflowExecutionContext);

// --- Initialize Strategies ---
const strategies = new Map<string, ITranslationStrategy>();
strategies.set('DirectS1', new DirectS1Strategy());
// const sirr1Strategy = new SIRR1Strategy(); // When ready
// strategies.set(sirr1Strategy.getName(), sirr1Strategy);


// --- Initialize McrOrchestrator ---
const orchestratorConfig: McrOrchestratorConfig = {
  llmProvider, // May not be strictly needed by orchestrator if executor context handles it
  reasonProvider,
  workflowExecutor,
  strategies,
  defaultStrategyName: DEFAULT_STRATEGY_NAME,
};
const orchestrator = new McrOrchestrator(orchestratorConfig);

// --- Hono App Setup ---
const app = new Hono();

// Middleware
app.use('*', cors()); // Enable CORS for all routes
app.use('*', honoLogger((message, ...rest) => { // Basic logger
    console.log(message, ...rest);
}));


// --- API Routes ---

// GET /status - Basic status endpoint
app.get('/status', (c) => {
  return c.json({
    status: 'ok',
    message: 'Aethelred MCR API is running.',
    llmProvider: llmProvider.getName(),
    reasonerProvider: reasonProvider.getName(),
    defaultStrategy: DEFAULT_STRATEGY_NAME,
    availableStrategies: orchestrator.listStrategies().map(s => s.name),
  });
});

// POST /sessions - Create a new session
app.post('/sessions', async (c) => {
  try {
    const session = await orchestrator.createSession();
    return c.json({
      id: session.id,
      createdAt: session.createdAt,
      knowledgeBaseSize: await session.knowledgeBase.getClauseCount(),
    }, 201);
  } catch (error: any) {
    return c.json({ error: 'Failed to create session', details: error.message }, 500);
  }
});

// GET /sessions/:sessionId - Get session details
app.get('/sessions/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  try {
    const session = await orchestrator.getSession(sessionId);
    if (!session) {
      return c.json({ error: 'Session not found' }, 404);
    }
    return c.json({
      id: session.id,
      createdAt: session.createdAt,
      lastAccessedAt: session.lastAccessedAt,
      knowledgeBase: await session.knowledgeBase.getKbString(),
      knowledgeBaseSize: await session.knowledgeBase.getClauseCount(),
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to retrieve session', details: error.message }, 500);
  }
});

// DELETE /sessions/:sessionId - Delete a session
app.delete('/sessions/:sessionId', async (c) => {
    const sessionId = c.req.param('sessionId');
    try {
        const deleted = await orchestrator.deleteSession(sessionId);
        if (!deleted) {
        return c.json({ error: 'Session not found or already deleted' }, 404);
        }
        return c.json({ message: `Session ${sessionId} deleted successfully.` });
    } catch (error: any) {
        return c.json({ error: 'Failed to delete session', details: error.message }, 500);
    }
});


// POST /sessions/:sessionId/assert - Assert facts/rules to a session
app.post('/sessions/:sessionId/assert', async (c) => {
  const sessionId = c.req.param('sessionId');
  try {
    const { text, strategy } = await c.req.json<{text: string, strategy?: string}>();
    if (!text || typeof text !== 'string') {
      return c.json({ error: 'Invalid request: "text" field is required and must be a string.' }, 400);
    }

    const result = await orchestrator.assert(sessionId, text, strategy);
    return c.json(result);
  } catch (error: any) {
    if (error.message.includes("not found")) return c.json({ error: error.message }, 404);
    return c.json({ error: 'Failed to assert to session', details: error.message }, 500);
  }
});

// POST /sessions/:sessionId/query - Query a session
app.post('/sessions/:sessionId/query', async (c) => {
  const sessionId = c.req.param('sessionId');
  try {
    const { query, strategy } = await c.req.json<{query: string, strategy?: string}>();
    if (!query || typeof query !== 'string') {
      return c.json({ error: 'Invalid request: "query" field is required and must be a string.' }, 400);
    }

    const result = await orchestrator.query(sessionId, query, strategy);
    return c.json(result);
  } catch (error: any) {
    if (error.message.includes("not found")) return c.json({ error: error.message }, 404);
    return c.json({ error: 'Failed to query session', details: error.message }, 500);
  }
});

// GET /strategies - List available translation strategies
app.get('/strategies', (c) => {
    try {
        return c.json(orchestrator.listStrategies());
    } catch (error: any) {
        return c.json({ error: 'Failed to list strategies', details: error.message }, 500);
    }
});


// Base route
app.get('/', (c) => c.text('Aethelred MCR API. Use /status for more info.'));


// Export the app for the Bun runtime (typically in index.ts or main.ts)
export default app;

// For local development, you might want to run it directly:
// if (import.meta.main) {
//   const port = Number(process.env.AETHELRED_PORT) || 3000;
//   console.log(`Aethelred API server starting on port ${port}...`);
//   Bun.serve({
//     fetch: app.fetch,
//     port: port,
//   });
//   console.log(`Aethelred API server running at http://localhost:${port}/`);
// }
// The above direct run part will be handled in aethelred/index.ts
