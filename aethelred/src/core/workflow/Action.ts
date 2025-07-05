// aethelred/src/core/workflow/Action.ts

import { Artifact, ArtifactType } from './Artifact';

/**
 * Defines the type of an action that can be performed within a Stage.
 */
export enum ActionType {
  LLM_GENERATE = "LLM_Generate",
  PROGRAMMATIC_TRANSFORM = "Programmatic_Transform",
  REASONER_EXECUTE = "Reasoner_Execute",
  SEMANTIC_COMPARE = "Semantic_Compare",
  // Could add more specific actions like:
  // USER_INPUT_REQUEST = "User_Input_Request",
  // EXTERNAL_API_CALL = "External_Api_Call",
}

/**
 * Base interface for all actions.
 * An Action is an operation performed within a Stage.
 */
export interface BaseAction<T_ActionType extends ActionType, T_Params extends object, T_InputArtifacts extends Artifact[], T_OutputArtifact extends Artifact> {
  type: T_ActionType;
  parameters: T_Params; // Parameters specific to this action instance (e.g., prompt template name, specific transformation logic)

  // Optional: Define expected input and output artifact types for static analysis/validation
  // expectedInputTypes: ArtifactType[];
  // expectedOutputType: ArtifactType;

  // The actual execution logic will be handled by the ExecutionEngine
  // This interface primarily defines the *what* and the *configuration* of the action.
}

// --- Specific Action Definitions ---

// LLM_Generate Action
export interface LlmGenerateParams {
  promptTemplateName?: string; // Name of a predefined prompt template
  directSystemPrompt?: string; // Or provide a direct system prompt
  directUserPrompt?: string; // And/or a direct user prompt (can be a template string itself)
  llmProviderId?: string; // Optional: specify a particular LLM provider instance
  llmModelId?: string; // Optional: specify a model for the provider
  outputArtifactType: ArtifactType; // e.g., ArtifactType.NL_TEXT, ArtifactType.SIR_JSON, ArtifactType.PROLOG_CLAUSE
  // Other LLM parameters like temperature, maxTokens, etc. could go here or be part of provider config
  options?: Record<string, any>; // For provider-specific options like temperature, max_tokens
}
export interface LlmGenerateAction extends BaseAction<
  ActionType.LLM_GENERATE,
  LlmGenerateParams,
  Artifact[], // Typically one input (e.g. NL_Text), but could be more for context
  Artifact // Output type is flexible, defined in params
> {}

// Programmatic_Transform Action
export type ProgrammaticTransformFunction<Input extends Artifact[], Output extends Artifact> =
  (inputs: Input, parameters: any) => Promise<Output>;

export interface ProgrammaticTransformParams<InputArtifacts extends Artifact[], OutputArtifact extends Artifact> {
  transformFunction?: ProgrammaticTransformFunction<InputArtifacts, OutputArtifact>; // The actual function to execute (could be identified by name too)
  transformerName?: string; // Identifier for a registered transformer function
  outputArtifactType: ArtifactType; // e.g., ArtifactType.PROLOG_CLAUSE from ArtifactType.SIR_JSON
  // Additional parameters for the specific transformation
  [key: string]: any;
}
export interface ProgrammaticTransformAction<InputArtifacts extends Artifact[] = Artifact[], OutputArtifact extends Artifact = Artifact> extends BaseAction<
  ActionType.PROGRAMMATIC_TRANSFORM,
  ProgrammaticTransformParams<InputArtifacts, OutputArtifact>,
  InputArtifacts,
  OutputArtifact
> {}

// Reasoner_Execute Action
export interface ReasonerExecuteParams {
  queryArtifactType: ArtifactType.QUERY_STRING | ArtifactType.PROLOG_CLAUSE; // Type of the artifact holding the query
  knowledgeBaseArtifactType?: ArtifactType.PROLOG_KB; // Optional: if KB is passed directly as an artifact
  sessionId?: string; // To use session-specific KB
  reasonerProviderId?: string; // Optional: specify a reasoner provider
  // Reasoner-specific options
  options?: Record<string, any>;
}
export interface ReasonerExecuteAction extends BaseAction<
  ActionType.REASONER_EXECUTE,
  ReasonerExecuteParams,
  [Artifact, Artifact?], // [QueryArtifact, Optional<KnowledgeBaseArtifact>]
  Artifact<ArtifactType.QUERY_RESULT, any>
> {}

// Semantic_Compare Action
export interface SemanticCompareParams {
  comparisonMethod?: 'embedding' | 'llm' | string; // Method for comparison
  llmProviderId?: string; // If using LLM for comparison
  embeddingModelId?: string; // If using embeddings
  // Other parameters like thresholds, specific prompts for LLM comparison
  options?: Record<string, any>;
}
export interface SemanticCompareAction extends BaseAction<
  ActionType.SEMANTIC_COMPARE,
  SemanticCompareParams,
  [Artifact, Artifact], // Two artifacts to compare
  Artifact<ArtifactType.CRITIQUE_RESULT, { similarity?: number; pass?: boolean; details?: string }>
> {}


// Union type for any action
export type Action =
  | LlmGenerateAction
  | ProgrammaticTransformAction
  | ReasonerExecuteAction
  | SemanticCompareAction;

// --- Action Creator Utility Functions (optional) ---

// Example:
// export function createLlmGenerateAction(params: LlmGenerateParams): LlmGenerateAction {
//   return {
//     type: ActionType.LLM_GENERATE,
//     parameters: params,
//   };
// }

// export function createProgrammaticTransformAction(params: ProgrammaticTransformParams<any,any>): ProgrammaticTransformAction {
//   return {
//     type: ActionType.PROGRAMMATIC_TRANSFORM,
//     parameters: params,
//   };
// }

// ... and so on for other actions
// These can be more fleshed out if needed, e.g. with default parameters or validation.
// For now, the interfaces are the most critical part.
