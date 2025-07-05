// aethelred/src/index.ts
console.log("Loading Aethelred Core Library...");

import {
  createNLTextArtifact,
  Artifact,
  NLTextArtifact,
  ArtifactType,
  createCritiqueResultArtifact
} from './core/workflow/Artifact.js';
import { McrOrchestrator } from './core/orchestration/McrOrchestrator.js';
import { ExecutionEngine } from './core/execution/ExecutionEngine.js';
import type { Workflow, Stage, DecisionPoint } from './core/workflow/Workflow.js';
import { ActionType, LlmGenerateAction, SemanticCompareAction, ReasonerExecuteAction } from './core/workflow/Action.js';
import { v4 as uuidv4 } from 'uuid';

// Import actual providers and interfaces
import { ILlmProvider, IReasonProvider } from './interfaces/index.js';
import { NullLlmProvider } from './providers/NullLlmProvider.js';
import { TauPrologReasonProvider } from './providers/TauPrologReasonProvider.js'; // We'll use this
import type { QueryResult } from './types'; // For mock reasoner

// Mock/Placeholder for TransformRegistry if not central to this test
const placeholderTransformRegistry = {
    getTransformer: (name: string) => {
        console.log(`[PlaceholderTransformRegistry] Transformer "${name}" requested.`);
        return async (inputs: Artifact[], params: any) => {
            console.log(`Executing placeholder transformer "${name}" with inputs:`, inputs, "and params:", params);
            return createNLTextArtifact({ content: `Transformed data by placeholder transformer for ${name}` });
        }
    }
};

export function initAethelred() {
  console.log("Aethelred initialized with actual provider setup.");

  // Setup LLM Providers
  const llmProviders = new Map<string, ILlmProvider>();
  llmProviders.set("default-llm", new NullLlmProvider()); // Default LLM
  llmProviders.set("null-llm", new NullLlmProvider());

  const critiqueLlmProvider: ILlmProvider = {
    generate: async (prompt: string): Promise<string> => {
      console.log(`[CritiqueLlmProvider] Received prompt for critique: ${prompt.substring(0,100)}...`);
      // Simulate a positive critique to allow workflow to proceed
      return JSON.stringify({ assessment: "positive", confidence: 0.9, reasoning: "This is a mock positive critique." });
    },
    getName: () => "critique-llm"
  };
  llmProviders.set("critique-llm", critiqueLlmProvider);

  // Example for adding Gemini/Ollama if configured - commented out for simplicity
  // if (process.env.GEMINI_API_KEY) {
  //   llmProviders.set("gemini-pro", new GeminiLlmProvider({ apiKey: process.env.GEMINI_API_KEY, model: "gemini-pro" }));
  // }

  // Setup Reasoner Providers
  const reasonerProviders = new Map<string, IReasonProvider>();
  // Using actual TauPrologReasonProvider
  reasonerProviders.set("default-reasoner", new TauPrologReasonProvider());
  reasonerProviders.set("tau-prolog", new TauPrologReasonProvider());

  // Mock reasoner for specific test cases if needed (alternative to full TauProlog)
  const mockReasoner: IReasonProvider = {
    query: async (kb: string, query: string): Promise<QueryResult> => {
      console.log(`[MockReasoner] KB: ${kb.substring(0,50)}..., Query: ${query}`);
      if (query.includes("father(X, john)")) {
        return { success: true, bindings: [{ X: "peter" }] };
      }
      return { success: true, bindings: [] };
    },
    validate: async (kb: string) => ({ valid: true }),
    getName: () => "mock-reasoner"
  };
  reasonerProviders.set("mock-reasoner", mockReasoner);


  const executionEngine = new ExecutionEngine(
    llmProviders,
    reasonerProviders,
    placeholderTransformRegistry
  );
  const mcrOrchestrator = new McrOrchestrator(executionEngine);
  return { executionEngine, mcrOrchestrator };
}

async function runFullTestWorkflow() {
  console.log("\n--- Starting Full Test Workflow Execution ---");
  try {
    const { mcrOrchestrator } = initAethelred();

    // 1. Define a simple workflow
    const textGenerationStageId = uuidv4();
    const reasoningStageId = uuidv4(); // New stage for reasoner
    const critiqueDecisionPointId = uuidv4();
    const finalOutputStageId = uuidv4(); // If critique is positive

    const testWorkflow: Workflow = {
      id: uuidv4(),
      name: "Simple Text Generation and Critique Workflow",
      description: "Generates text, critiques it, and produces a final output.",
      expectedInputArtifacts: [{ name: "initialPrompt", type: ArtifactType.NL_TEXT, description: "Initial prompt for text generation." }],
      expectedOutputArtifacts: [{ name: "finalText", type: ArtifactType.NL_TEXT, description: "The final processed text." }],
      startNodeId: textGenerationStageId,
      nodes: {
        [textGenerationStageId]: {
          id: textGenerationStageId,
          name: "Generate Initial Text",
          description: "Uses an LLM to generate text based on the input prompt.",
          action: {
            type: ActionType.LLM_GENERATE,
            parameters: {
              // promptTemplateName: "simple_generation_prompt", // Will use directUserPrompt from artifact
              outputArtifactType: ArtifactType.NL_TEXT,
              llmProviderId: "null-llm", // Using NullLlmProvider
              llmModelId: "null-model"
            }
          } as LlmGenerateAction,
          inputArtifactNames: ["initialPrompt"],
          outputArtifactName: "generatedText"
        } as Stage,
        [reasoningStageId]: {
          id: reasoningStageId,
          name: "Simple Reasoning Stage",
          description: "Uses TauPrologReasoner to answer a query based on a small KB.",
          action: {
            type: ActionType.REASONER_EXECUTE,
            parameters: {
              queryArtifactType: ArtifactType.QUERY_STRING, // Expects a QueryStringArtifact
              knowledgeBaseArtifactType: ArtifactType.PROLOG_KB, // Expects a PrologKbArtifact
              outputArtifactType: ArtifactType.QUERY_RESULT,
              reasonerProviderId: "tau-prolog", // Using TauPrologReasonProvider
            }
          } as ReasonerExecuteAction,
          inputArtifactNames: ["reasonerQuery", "knowledgeBase"], // Names defined in initialArtifactsMap
          outputArtifactName: "reasoningResults"
        } as Stage,
        [critiqueDecisionPointId]: {
          id: critiqueDecisionPointId,
          name: "Critique Generated Text",
          description: "Uses an LLM to critique the generated text.",
          evaluationAction: {
            type: ActionType.LLM_GENERATE, // Using LLM_GENERATE to produce a CritiqueResult like structure
            parameters: {
              directUserPrompt: "Critique the following text and provide assessment, confidence, and reasoning in JSON format: {inputText}", // {inputText} will be replaced by orchestrator or EE
              outputArtifactType: ArtifactType.CRITIQUE_RESULT, // This will be a string, but EE should parse to JSON for CritiqueResult
              llmProviderId: "critique-llm", // Using the specialized critique LLM provider
              llmModelId: "critique-model-mock"
            }
          } as LlmGenerateAction,
          // evaluationAction: { // Example of a SemanticCompare for decision - might be more typical
          //   type: ActionType.SEMANTIC_COMPARE,
          //   parameters: {
          //     comparisonMethod: "llm_critique_as_comparison",
          //     // referenceArtifactName: "goldenStandard", // Would need another input for this
          //     // outputArtifactType: ArtifactType.CRITIQUE_RESULT // Default for semantic compare
          //   }
          // } as SemanticCompareAction,
          routingConditions: [
            {
              conditionName: "Critique Positive",
              artifactFieldPath: "assessment", // Field in the CritiqueResultArtifact's content
              operator: "===",
              value: "positive",
              nextNodeId: finalOutputStageId
            }
          ],
          defaultNextNodeId: textGenerationStageId // If critique is not positive, regenerate (simple loop)
        } as DecisionPoint,
        [finalOutputStageId]: {
          id: finalOutputStageId,
          name: "Final Output Stage",
          description: "Placeholder for final output if critique is positive.",
          action: { // A simple programmatic transform to signify end
            type: ActionType.PROGRAMMATIC_TRANSFORM,
            parameters: {
                transformerName: "finalOutputFormatter",
                outputArtifactType: ArtifactType.NL_TEXT,
            }
          },
          inputArtifactNames: ["generatedText"], // Takes the text from the generation stage
          outputArtifactName: "finalText"
        } as Stage
      },
      edges: [
        { id: uuidv4(), sourceNodeId: textGenerationStageId, targetNodeId: reasoningStageId, description: "From text generation to reasoning" },
        { id: uuidv4(), sourceNodeId: reasoningStageId, targetNodeId: critiqueDecisionPointId, description: "From reasoning to critique" },
        // Routing from critique is handled by routingConditions (to finalOutputStageId or back to textGenerationStageId)
      ]
    };

    // 2. Create initial artifacts
    const initialArtifactsMap = new Map<string, Artifact>();

    const initialPromptArtifact = createNLTextArtifact({ content: "Tell me a short story about a brave robot." });
    initialArtifactsMap.set("initialPrompt", initialPromptArtifact);
    console.log(`[index.ts] Initial prompt artifact ID: ${initialPromptArtifact.id}, content: "${initialPromptArtifact.content}"`);

    const { createQueryStringArtifact, createPrologKbArtifact } = await import('./core/workflow/Artifact.js');
    const reasonerQueryArtifact = createQueryStringArtifact({content: "father(X, john).", metadata: { type: "prolog" }});
    initialArtifactsMap.set("reasonerQuery", reasonerQueryArtifact);
    const knowledgeBaseArtifact = createPrologKbArtifact({content: "father(peter, john).\nfather(mark, lucy).", metadata: { type: "prolog" }});
    initialArtifactsMap.set("knowledgeBase", knowledgeBaseArtifact);
    console.log(`[index.ts] Reasoner query: "${reasonerQueryArtifact.content}", KB: "${knowledgeBaseArtifact.content.substring(0,30)}..."`);


    // 3. Execute the workflow
    console.log(`[index.ts] Executing workflow "${testWorkflow.name}"...`);
    const outputArtifacts = await mcrOrchestrator.executeWorkflow(testWorkflow, initialArtifactsMap, "test-session-001");

    // 4. Log results
    console.log("\n--- Full Test Workflow Execution Finished ---");
    if (outputArtifacts.size > 0) {
      console.log("Output artifacts from workflow:");
      outputArtifacts.forEach((artifact, name) => {
        console.log(`  Name: "${name}", ID: ${artifact.id}, Type: ${artifact.type}, Content:`, artifact.content);
      });
    } else {
      console.log("Workflow did not produce any named output artifacts according to its definition.");
    }

  } catch (error) {
    console.error("--- Full Test Workflow Execution Failed ---");
    console.error("Error during workflow execution:", error);
  }
}

// If this file is run directly
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === path.resolve(__filename)) {
  console.log("-----------------------------------------------------");
  console.log("aethelred/src/index.ts executed directly. Running full test workflow...");
  console.log("-----------------------------------------------------");
  // initAethelred(); // Called within runFullTestWorkflow
  runFullTestWorkflow().then(() => {
    console.log("\nFull test workflow promise resolved.");
    console.log("-----------------------------------------------------");
  }).catch(e => {
    console.error("\nError running full test workflow from direct execution:", e);
    console.log("-----------------------------------------------------");
  });
}
