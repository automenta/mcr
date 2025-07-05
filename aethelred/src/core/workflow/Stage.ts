// aethelred/src/core/workflow/Stage.ts

import { Artifact } from './Artifact';
import { Action } from './Action';

/**
 * Represents a single step in a workflow.
 * A Stage executes an Action to transform input Artifacts into an output Artifact.
 */
export interface Stage<T_InputArtifacts extends Artifact[] = Artifact[], T_OutputArtifact extends Artifact = Artifact> {
  id: string; // Unique identifier for this stage within a workflow definition
  name: string; // Human-readable name for the stage (e.g., "Translate NL to SIR")
  description?: string; // Optional longer description of what the stage does

  action: Action; // The action to be performed by this stage

  // Defines how input artifacts for this stage are sourced.
  // This allows flexibility, e.g., taking specific artifacts from a pool or previous stages.
  // For simplicity, we can start with a convention that a stage takes the output of the previous stage(s).
  // More complex mapping can be added later.
  // Example: inputMappings: { [actionInputName: string]: string /* artifactId or previousStageOutputRef */ };

  // For now, let's assume inputs are an ordered list passed to the execution engine,
  // and the action within the stage knows how to handle them.

  // Optional: configuration for error handling, retries, timeouts for this stage
  errorHandling?: {
    retries?: number;
    timeoutMs?: number;
    fallbackStageId?: string; // ID of another stage to go to on failure
  };

  // Optional: logging level or specific logging instructions for this stage
  logging?: {
    level?: 'debug' | 'info' | 'warn';
    logInputArtifacts?: boolean;
    logOutputArtifact?: boolean;
  };
}

// --- Stage Creator Utility Function (optional) ---
// import { v4 as uuidv4 } from 'uuid';

// type StageFactoryParams = {
//   name: string;
//   action: Action;
//   description?: string;
//   id?: string;
//   errorHandling?: Stage['errorHandling'];
//   logging?: Stage['logging'];
// }

// export function createStage(params: StageFactoryParams): Stage {
//   return {
//     id: params.id || uuidv4(),
//     name: params.name,
//     description: params.description,
//     action: params.action,
//     errorHandling: params.errorHandling,
//     logging: params.logging,
//   };
// }
