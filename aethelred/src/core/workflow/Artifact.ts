// aethelred/src/core/workflow/Artifact.ts

/**
 * Represents the type of an artifact.
 * Using a string enum for better readability and potential serialization.
 */
export enum ArtifactType {
  NL_TEXT = "NL_Text", // Natural Language text
  SIR_JSON = "SIR_JSON", // Structured Intermediate Representation (JSON)
  PROLOG_CLAUSE = "Prolog_Clause", // A single Prolog fact or rule
  PROLOG_KB = "Prolog_KB", // A collection of Prolog facts/rules forming a knowledge base
  QUERY_STRING = "Query_String", // A query string (e.g., for Prolog)
  QUERY_RESULT = "Query_Result", // Result from a reasoner query
  NL_EXPLANATION = "NL_Explanation", // Natural Language explanation
  CRITIQUE_RESULT = "Critique_Result", // Result of a critique/validation step
  UNTYPED_DATA = "Untyped_Data", // For generic data, try to avoid
}

/**
 * Base interface for all artifacts.
 * Artifacts are pieces of data that are produced or consumed by stages in a workflow.
 */
export interface Artifact<T_Type extends ArtifactType = ArtifactType, T_Content = unknown> {
  id: string; // Unique identifier for this artifact instance
  type: T_Type; // The specific type of the artifact
  content: T_Content; // The actual data payload of the artifact
  createdAt: Date; // Timestamp of creation
  metadata?: Record<string, any>; // Optional metadata (e.g., source, confidence)
}

// --- Specific Artifact Type Interfaces (extending the base Artifact) ---

export interface NLTextArtifact extends Artifact<ArtifactType.NL_TEXT, string> {}

export interface SirJsonArtifact extends Artifact<ArtifactType.SIR_JSON, object> {} // Assuming SIR is a JSON object

export interface PrologClauseArtifact extends Artifact<ArtifactType.PROLOG_CLAUSE, string> {}

export interface PrologKbArtifact extends Artifact<ArtifactType.PROLOG_KB, string> {} // KB as a string of clauses

export interface QueryStringArtifact extends Artifact<ArtifactType.QUERY_STRING, string> {}

// QueryResult content can be complex, e.g., an array of bindings or a boolean
export interface QueryResultArtifact extends Artifact<ArtifactType.QUERY_RESULT, any> {}

export interface NLExplanationArtifact extends Artifact<ArtifactType.NL_EXPLANATION, string> {}

// CritiqueResult might be a simple pass/fail or a more detailed structure
export interface CritiqueResultArtifact extends Artifact<ArtifactType.CRITIQUE_RESULT, { pass: boolean; details?: string; data?: any }> {}

export interface UntypedDataArtifact extends Artifact<ArtifactType.UNTYPED_DATA, any> {}


// --- Utility functions for creating artifacts (optional, but good practice) ---

import { v4 as uuidv4 } from 'uuid';

type ArtifactFactoryParams<T_Content> = {
  content: T_Content;
  id?: string;
  metadata?: Record<string, any>;
};

export function createArtifact<T_Type extends ArtifactType, T_Content>(
  type: T_Type,
  params: ArtifactFactoryParams<T_Content>
): Artifact<T_Type, T_Content> {
  return {
    id: params.id || uuidv4(),
    type,
    content: params.content,
    createdAt: new Date(),
    metadata: params.metadata,
  };
}

// Example typed factory functions:
export function createNLTextArtifact(params: ArtifactFactoryParams<string>): NLTextArtifact {
  return createArtifact(ArtifactType.NL_TEXT, params);
}

export function createSirJsonArtifact(params: ArtifactFactoryParams<object>): SirJsonArtifact {
  return createArtifact(ArtifactType.SIR_JSON, params);
}

export function createPrologClauseArtifact(params: ArtifactFactoryParams<string>): PrologClauseArtifact {
  return createArtifact(ArtifactType.PROLOG_CLAUSE, params);
}

export function createPrologKbArtifact(params: ArtifactFactoryParams<string>): PrologKbArtifact {
  return createArtifact(ArtifactType.PROLOG_KB, params);
}

export function createQueryStringArtifact(params: ArtifactFactoryParams<string>): QueryStringArtifact {
  return createArtifact(ArtifactType.QUERY_STRING, params);
}

export function createQueryResultArtifact(params: ArtifactFactoryParams<any>): QueryResultArtifact {
  return createArtifact(ArtifactType.QUERY_RESULT, params);
}

export function createNLExplanationArtifact(params: ArtifactFactoryParams<string>): NLExplanationArtifact {
  return createArtifact(ArtifactType.NL_EXPLANATION, params);
}

export function createCritiqueResultArtifact(params: ArtifactFactoryParams<{ pass: boolean; details?: string; data?: any }>): CritiqueResultArtifact {
  return createArtifact(ArtifactType.CRITIQUE_RESULT, params);
}
