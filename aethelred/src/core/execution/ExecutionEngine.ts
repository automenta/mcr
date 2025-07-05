// aethelred/src/core/execution/ExecutionEngine.ts

import { Artifact, ArtifactType, createArtifact, createCritiqueResultArtifact, createNLTextArtifact, createPrologClauseArtifact, createPrologKbArtifact, createQueryStringArtifact, createQueryResultArtifact, createSirJsonArtifact } from '../workflow/Artifact.js';
import type { Action } from '../workflow/Action.js'; // Action is a union type, import type for safety with verbatimModuleSyntax
import { ActionType, LlmGenerateAction, ProgrammaticTransformAction, ReasonerExecuteAction, SemanticCompareAction } from '../workflow/Action.js'; // Enum and interfaces are values/types
import type { Stage } from '../workflow/Stage.js';
import type { DecisionPoint } from '../workflow/DecisionPoint.js';

// --- Placeholder Service Interfaces ---
// These would eventually be replaced by actual service implementations or imported from existing JS services.

interface LlmServiceInterface {
  generate(params: {
    systemPrompt?: string;
    userPrompt?: string;
    promptTemplateName?: string;
    // inputArtifacts?: Artifact[]; // For context
    options?: Record<string, any>;
  }): Promise<string>; // Returns raw string output from LLM
}

interface ReasonerServiceInterface {
  executeQuery(params: {
    knowledgeBase: string; // Prolog KB as a string
    query: string; // Prolog query string
    options?: Record<string, any>;
  }): Promise<any>; // Returns raw query result (e.g., bindings, boolean)
}

// For Programmatic Transforms, we might have a registry of functions
type TransformFunction = (inputs: Artifact[], params: any) => Promise<Artifact>;
interface TransformRegistryInterface {
  getTransformer(name: string): TransformFunction | undefined;
}

export class ExecutionEngine {
  private llmService: LlmServiceInterface;
  private reasonerService: ReasonerServiceInterface;
  private transformRegistry: TransformRegistryInterface;

  constructor(
    llmService?: LlmServiceInterface,
    reasonerService?: ReasonerServiceInterface,
    transformRegistry?: TransformRegistryInterface
  ) {
    // Use provided services or default to placeholder implementations
    this.llmService = llmService || {
      generate: async (params) => {
        console.warn(`[ExecutionEngine] PlaceholderLlmService: Simulating LLM generation for prompt/template: ${params.promptTemplateName || params.userPrompt?.substring(0,50)+"..."}`);
        return `Simulated LLM output for: ${params.userPrompt || params.promptTemplateName}`;
      }
    };
    this.reasonerService = reasonerService || {
      executeQuery: async (params) => {
        console.warn(`[ExecutionEngine] PlaceholderReasonerService: Simulating query execution for: ${params.query}`);
        return { result: `Simulated result for query: ${params.query}` };
      }
    };
    this.transformRegistry = transformRegistry || {
        getTransformer: (name) => {
            console.warn(`[ExecutionEngine] PlaceholderTransformRegistry: Transformer "${name}" requested.`);
            // Return a dummy transformer
            return async (inputs, params) => {
                console.log(`Executing dummy transformer "${name}" with inputs:`, inputs, "and params:", params);
                return createArtifact(params.outputArtifactType || ArtifactType.UNTYPED_DATA, { content: "Transformed data by dummy transformer" });
            }
        }
    }
    console.log("[ExecutionEngine] Initialized.");
  }

  /**
   * Executes the action defined within a stage.
   * @param stage The stage to execute.
   * @param inputArtifacts An array of input artifacts for the stage's action.
   * @returns A promise that resolves to the output artifact of the stage.
   */
  public async executeStage(stage: Stage, inputArtifacts: Artifact[]): Promise<Artifact> {
    console.log(`[ExecutionEngine] Executing stage: "${stage.name}" (Action Type: ${stage.action.type})`);
    // console.log("[ExecutionEngine] Input artifacts for stage:", inputArtifacts);

    const action = stage.action;
    let outputArtifact: Artifact;

    try {
      switch (action.type) {
        case ActionType.LLM_GENERATE:
          outputArtifact = await this.handleLlmGenerateAction(action as LlmGenerateAction, inputArtifacts);
          break;
        case ActionType.PROGRAMMATIC_TRANSFORM:
          outputArtifact = await this.handleProgrammaticTransformAction(action as ProgrammaticTransformAction, inputArtifacts);
          break;
        case ActionType.REASONER_EXECUTE:
          outputArtifact = await this.handleReasonerExecuteAction(action as ReasonerExecuteAction, inputArtifacts);
          break;
        case ActionType.SEMANTIC_COMPARE:
          outputArtifact = await this.handleSemanticCompareAction(action as SemanticCompareAction, inputArtifacts);
          break;
        default:
          console.error(`[ExecutionEngine] Unknown action type: ${(action as any).type}`);
          throw new Error(`Unsupported action type: ${(action as any).type}`);
      }
    } catch (error) {
        console.error(`[ExecutionEngine] Error executing action "${action.type}" in stage "${stage.name}":`, error);
        // Create an error artifact or rethrow? For now, rethrow.
        // TODO: Implement more sophisticated error handling, possibly creating an ErrorArtifact.
        throw error;
    }

    // console.log(`[ExecutionEngine] Stage "${stage.name}" produced output artifact:`, outputArtifact);
    return outputArtifact;
  }

  /**
   * Executes the evaluation action of a DecisionPoint.
   * This is similar to executeStage but specifically for actions within DecisionPoints.
   * @param decisionPoint The decision point whose evaluation action is to be executed.
   * @param inputArtifact The primary input artifact for the evaluation.
   * @returns A promise that resolves to the artifact produced by the evaluation action (e.g., a CritiqueResultArtifact).
   */
  public async executeDecisionPointEvaluation(decisionPoint: DecisionPoint, inputArtifact: Artifact): Promise<Artifact> {
    console.log(`[ExecutionEngine] Executing evaluation for DecisionPoint: "${decisionPoint.name}" (Action Type: ${decisionPoint.evaluationAction.type})`);

    const action = decisionPoint.evaluationAction;
    let evaluationOutputArtifact: Artifact;

    // For now, assume the decision point evaluation actions are a subset of regular actions
    // and can be handled similarly. We pass only the single relevant input artifact.
    // More complex scenarios might need different handling.
    try {
      switch (action.type) {
        case ActionType.LLM_GENERATE: // e.g., LLM-based critique
          evaluationOutputArtifact = await this.handleLlmGenerateAction(action as LlmGenerateAction, [inputArtifact]);
          break;
        case ActionType.SEMANTIC_COMPARE:
           // Semantic compare usually takes two inputs. The DecisionPoint definition needs to specify how these are provided.
           // For now, this is a simplification if it only gets one input here.
           // This indicates a mismatch or need for better input mapping in Orchestrator or DP definition.
           if (inputArtifactsToArray(inputArtifact).length < 2 && (action as SemanticCompareAction).parameters) {
             console.warn(`[ExecutionEngine] SemanticCompareAction in DecisionPoint "${decisionPoint.name}" expects two inputs but received one. This might lead to errors or require specific handling in the action's implementation.`);
           }
          evaluationOutputArtifact = await this.handleSemanticCompareAction(action as SemanticCompareAction, inputArtifactsToArray(inputArtifact));
          break;
        // Other actions suitable for evaluation could be added here.
        case ActionType.PROGRAMMATIC_TRANSFORM: // e.g. a programmatic rule-based critique
            evaluationOutputArtifact = await this.handleProgrammaticTransformAction(action as ProgrammaticTransformAction, [inputArtifact]);
            break;
        default:
          console.error(`[ExecutionEngine] Unsupported action type for DecisionPoint evaluation: ${(action as any).type}`);
          throw new Error(`Unsupported action type in DecisionPoint: ${(action as any).type}`);
      }
    } catch (error) {
        console.error(`[ExecutionEngine] Error executing evaluation action "${action.type}" in DecisionPoint "${decisionPoint.name}":`, error);
        throw error;
    }
    return evaluationOutputArtifact;
  }


  // --- Action Handlers ---

  private async handleLlmGenerateAction(action: LlmGenerateAction, inputs: Artifact[]): Promise<Artifact> {
    // TODO: Sophisticated input processing to gather context for the LLM prompt
    // For now, assume the first input's content is the primary user text, if any.
    const userText = inputs.length > 0 && typeof inputs[0].content === 'string' ? inputs[0].content : "";

    const llmOutputString = await this.llmService.generate({
      promptTemplateName: action.parameters.promptTemplateName,
      directSystemPrompt: action.parameters.directSystemPrompt,
      // If directUserPrompt is a template, it needs filling. For now, assume it's literal or filled by Orchestrator.
      userPrompt: action.parameters.directUserPrompt || userText,
      options: action.parameters.options,
    });

    // Create the specified output artifact type
    const outputArtifactParams = { content: llmOutputString, metadata: { llmProvider: action.parameters.llmProviderId, model: action.parameters.llmModelId }};
    switch(action.parameters.outputArtifactType) {
        case ArtifactType.NL_TEXT: return createNLTextArtifact(outputArtifactParams);
        case ArtifactType.SIR_JSON:
            try {
                return createSirJsonArtifact({ ...outputArtifactParams, content: JSON.parse(llmOutputString) });
            } catch (e) {
                console.error("[ExecutionEngine] Failed to parse LLM output as JSON for SIR_JSON artifact:", e);
                throw new Error("LLM output for SIR_JSON was not valid JSON.");
            }
        case ArtifactType.PROLOG_CLAUSE: return createPrologClauseArtifact(outputArtifactParams);
        // Add other types as needed
        default:
            console.warn(`[ExecutionEngine] LLM_GENERATE produced output for unhandled artifact type ${action.parameters.outputArtifactType}. Returning as UntypedDataArtifact.`);
            return createArtifact(ArtifactType.UNTYPED_DATA, { content: llmOutputString });
    }
  }

  private async handleProgrammaticTransformAction(action: ProgrammaticTransformAction, inputs: Artifact[]): Promise<Artifact> {
    const transformerName = action.parameters.transformerName;
    const directTransformFn = action.parameters.transformFunction;

    if (!transformerName && !directTransformFn) {
        throw new Error("ProgrammaticTransformAction requires either a transformerName or a direct transformFunction.");
    }

    let transformFn: TransformFunction | undefined = directTransformFn;
    if (transformerName) {
        transformFn = this.transformRegistry.getTransformer(transformerName);
        if (!transformFn) {
            throw new Error(`Transformer function "${transformerName}" not found in registry.`);
        }
    }

    // Pass all parameters to the transform function, it can pick what it needs.
    return await transformFn!(inputs, action.parameters);
  }

  private async handleReasonerExecuteAction(action: ReasonerExecuteAction, inputs: Artifact[]): Promise<Artifact> {
    // Expects QueryArtifact as inputs[0], optionally KnowledgeBaseArtifact as inputs[1]
    if (inputs.length === 0) throw new Error("ReasonerExecuteAction requires at least a QueryArtifact as input.");

    const queryArtifact = inputs[0];
    if (queryArtifact.type !== action.parameters.queryArtifactType) {
        throw new Error(`Type mismatch for query artifact. Expected ${action.parameters.queryArtifactType}, got ${queryArtifact.type}.`);
    }
    const queryString = queryArtifact.content as string;

    let knowledgeBaseString = "";
    if (action.parameters.knowledgeBaseArtifactType && inputs.length > 1) {
        const kbArtifact = inputs[1];
        if (kbArtifact.type !== action.parameters.knowledgeBaseArtifactType) {
            throw new Error(`Type mismatch for knowledge base artifact. Expected ${action.parameters.knowledgeBaseArtifactType}, got ${kbArtifact.type}.`);
        }
        knowledgeBaseString = kbArtifact.content as string;
    } else if (action.parameters.sessionId) {
        // TODO: Fetch KB from SessionManager using sessionId. This requires SessionManager integration.
        console.warn("[ExecutionEngine] SessionId provided to ReasonerExecuteAction, but SessionManager integration is not yet implemented. Using empty KB.");
        // knowledgeBaseString = await sessionManager.getKnowledgeBase(action.parameters.sessionId);
    }

    const queryResultData = await this.reasonerService.executeQuery({
      knowledgeBase: knowledgeBaseString,
      query: queryString,
      options: action.parameters.options,
    });

    return createQueryResultArtifact({ content: queryResultData, metadata: { reasoner: action.parameters.reasonerProviderId }});
  }

  private async handleSemanticCompareAction(action: SemanticCompareAction, inputs: Artifact[]): Promise<Artifact> {
    if (inputs.length < 2) throw new Error("SemanticCompareAction requires two input artifacts.");

    const artifact1 = inputs[0];
    const artifact2 = inputs[1];

    console.warn(`[ExecutionEngine] PlaceholderSemanticCompare: Simulating comparison between artifact "${artifact1.id}" and "${artifact2.id}".`);
    // Actual implementation would call an embedding service or another LLM.
    // For now, simulate a "pass" with some dummy data.
    const simulatedComparison = {
      similarity: Math.random(), // Random similarity score
      pass: Math.random() > 0.3, // Usually passes
      details: "Simulated semantic comparison.",
      method: action.parameters.comparisonMethod || "simulated_placeholder"
    };

    return createCritiqueResultArtifact({ content: simulatedComparison });
  }
}

// Helper to ensure input to decision point evaluation is an array for handler consistency
function inputArtifactsToArray(input: Artifact | Artifact[]): Artifact[] {
    return Array.isArray(input) ? input : [input];
}
