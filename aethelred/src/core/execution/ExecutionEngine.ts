// aethelred/src/core/execution/ExecutionEngine.ts

import { Artifact, ArtifactType, createArtifact, createCritiqueResultArtifact, createNLTextArtifact, createPrologClauseArtifact, createPrologKbArtifact, createQueryStringArtifact, createQueryResultArtifact, createSirJsonArtifact } from '../workflow/Artifact.js';
import type { Action } from '../workflow/Action.js'; // Action is a union type, import type for safety with verbatimModuleSyntax
import { ActionType, LlmGenerateAction, ProgrammaticTransformAction, ReasonerExecuteAction, SemanticCompareAction } from '../workflow/Action.js'; // Enum and interfaces are values/types
import type { Stage } from '../workflow/Stage.js';
import type { DecisionPoint } from '../workflow/DecisionPoint.js';

import { ILlmProvider, IReasonProvider } from '../../interfaces/index.js'; // Assuming interfaces are exported via index

// For Programmatic Transforms, we might have a registry of functions
type TransformFunction = (inputs: Artifact[], params: any) => Promise<Artifact>;
interface TransformRegistryInterface {
  getTransformer(name: string): TransformFunction | undefined;
}

export class ExecutionEngine {
  private llmProviders: Map<string, ILlmProvider>;
  private reasonerProviders: Map<string, IReasonProvider>;
  private transformRegistry: TransformRegistryInterface;

  constructor(
    llmProviders: Map<string, ILlmProvider>, // Expect a map of available LLM providers
    reasonerProviders: Map<string, IReasonProvider>, // Expect a map of available Reasoner providers
    transformRegistry?: TransformRegistryInterface  // Optional, can have a default
  ) {
    this.llmProviders = llmProviders;
    this.reasonerProviders = reasonerProviders;

    this.transformRegistry = transformRegistry || {
        getTransformer: (name) => {
            console.warn(`[ExecutionEngine] DefaultTransformRegistry: Transformer "${name}" requested. No custom registry provided.`);
            // Return a dummy transformer if no registry is provided
            return async (inputs, params) => {
                console.log(`Executing dummy transformer "${name}" with inputs:`, inputs, "and params:", params);
                // Ensure outputArtifactType is valid or default
                const outputType = Object.values(ArtifactType).includes(params.outputArtifactType)
                                   ? params.outputArtifactType
                                   : ArtifactType.UNTYPED_DATA;
                return createArtifact(outputType, { content: `Transformed data by dummy transformer for ${name}` });
            }
        }
    };
    console.log("[ExecutionEngine] Initialized with provider maps.");
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
    const providerId = action.parameters.llmProviderId || "default"; // Or however the provider is specified
    const llmProvider = this.llmProviders.get(providerId);

    if (!llmProvider) {
      throw new Error(`[ExecutionEngine] LLMProvider "${providerId}" not found for LlmGenerateAction.`);
    }

    // TODO: More sophisticated input processing and prompt templating.
    // For now, concatenate input artifact contents or use directUserPrompt.
    let prompt = action.parameters.directUserPrompt || "";
    if (!prompt) {
        prompt = inputs.map(artifact => {
            if (typeof artifact.content === 'string') return artifact.content;
            if (typeof artifact.content === 'object' && artifact.content !== null) return JSON.stringify(artifact.content);
            return '';
        }).join("\n");
    }

    // Incorporate system prompt if provided (some providers might handle this differently)
    if (action.parameters.directSystemPrompt) {
        // This is a simplistic approach; actual providers might need specific handling for system prompts.
        // For example, some APIs have a separate parameter, others expect it as part of the message history.
        prompt = `${action.parameters.directSystemPrompt}\n\nUser: ${prompt}`;
    }

    // TODO: Handle action.parameters.options (e.g. temperature, max_tokens)
    // This would likely be passed to the provider's generate method if it supports an options object.
    // For now, the ILlmProvider interface only takes a prompt string.
    if(action.parameters.options && Object.keys(action.parameters.options).length > 0) {
        console.warn(`[ExecutionEngine] LLM options provided but current ILlmProvider interface does not support passing them directly. Options:`, action.parameters.options);
    }

    console.log(`[ExecutionEngine] Calling LLM provider "${providerId}" with prompt: "${prompt.substring(0,100)}..."`);
    const llmOutputString = await llmProvider.generate(prompt);

    // Create the specified output artifact type
    const outputArtifactParams = { content: llmOutputString, metadata: { llmProvider: action.parameters.llmProviderId, model: action.parameters.llmModelId }};
    let parsedContent: any = llmOutputString; // Default to string content

    try {
        if (action.parameters.outputArtifactType === ArtifactType.SIR_JSON ||
            action.parameters.outputArtifactType === ArtifactType.CRITIQUE_RESULT) {
            parsedContent = JSON.parse(llmOutputString);
        }
    } catch (e) {
        console.error(`[ExecutionEngine] Failed to parse LLM output as JSON for ${action.parameters.outputArtifactType} artifact:`, e);
        // For Critique_Result, if parsing fails, it's problematic for decision points.
        // For SIR_JSON, it's also a problem.
        // Consider creating an ErrorArtifact or re-throwing depending on desired robustness.
        // For now, let it fall through to create an UntypedDataArtifact or throw if type demands JSON.
        if (action.parameters.outputArtifactType === ArtifactType.SIR_JSON || action.parameters.outputArtifactType === ArtifactType.CRITIQUE_RESULT) {
             throw new Error(`LLM output for ${action.parameters.outputArtifactType} was not valid JSON: ${llmOutputString}`);
        }
    }

    const finalContent = parsedContent; // Content to be used for artifact creation

    switch(action.parameters.outputArtifactType) {
        case ArtifactType.NL_TEXT: return createNLTextArtifact({ ...outputArtifactParams, content: llmOutputString }); // Ensure NL_TEXT always gets string
        case ArtifactType.SIR_JSON: return createSirJsonArtifact({ ...outputArtifactParams, content: finalContent });
        case ArtifactType.PROLOG_CLAUSE: return createPrologClauseArtifact(outputArtifactParams); // Assumes string content
        case ArtifactType.CRITIQUE_RESULT: return createCritiqueResultArtifact({ ...outputArtifactParams, content: finalContent });
        // Add other types as needed
        default:
            console.warn(`[ExecutionEngine] LLM_GENERATE produced output for unhandled or non-JSON target artifact type ${action.parameters.outputArtifactType}. Returning as UntypedDataArtifact with original string output.`);
            return createArtifact(ArtifactType.UNTYPED_DATA, { content: llmOutputString }); // Fallback to original string for safety
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
    const providerId = action.parameters.reasonerProviderId || "default"; // Or however the provider is specified
    const reasonerProvider = this.reasonerProviders.get(providerId);

    if (!reasonerProvider) {
      throw new Error(`[ExecutionEngine] ReasonerProvider "${providerId}" not found for ReasonerExecuteAction.`);
    }

    // Expects QueryArtifact as inputs[0], optionally KnowledgeBaseArtifact as inputs[1]
    if (inputs.length === 0) throw new Error("ReasonerExecuteAction requires at least a QueryArtifact as input.");

    const queryArtifact = inputs.find(a => a.type === action.parameters.queryArtifactType);
    if (!queryArtifact) {
        throw new Error(`Required QueryArtifact (type: ${action.parameters.queryArtifactType}) not found in inputs.`);
    }
    const queryString = queryArtifact.content as string;

    let knowledgeBaseString = "";
    if (action.parameters.knowledgeBaseArtifactType) {
        const kbArtifact = inputs.find(a => a.type === action.parameters.knowledgeBaseArtifactType);
        if (kbArtifact) {
            knowledgeBaseString = kbArtifact.content as string;
        } else {
            console.warn(`[ExecutionEngine] KnowledgeBaseArtifact (type: ${action.parameters.knowledgeBaseArtifactType}) specified but not found in inputs. Proceeding with empty/default KB for provider.`);
        }
    } else if (action.parameters.sessionId) {
        // TODO: Fetch KB from SessionManager using sessionId. This requires SessionManager integration.
        console.warn("[ExecutionEngine] SessionId provided to ReasonerExecuteAction, but SessionManager integration is not yet implemented. Using empty KB.");
        // knowledgeBaseString = await sessionManager.getKnowledgeBase(action.parameters.sessionId);
    }

    // TODO: Handle action.parameters.options for reasoner
    // The IReasonProvider.query interface does not currently take an options object.
    if(action.parameters.options && Object.keys(action.parameters.options).length > 0) {
        console.warn(`[ExecutionEngine] Reasoner options provided but current IReasonProvider interface does not support passing them directly. Options:`, action.parameters.options);
    }

    console.log(`[ExecutionEngine] Calling Reasoner provider "${providerId}" with query: "${queryString}"`);
    const queryResultData = await reasonerProvider.query(knowledgeBaseString, queryString);

    return createQueryResultArtifact({
        content: queryResultData, // queryResultData is already { success: boolean, bindings?: any[], error?: string }
        metadata: { reasoner: providerId }
    });
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
