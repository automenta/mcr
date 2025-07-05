// aethelred/src/core/workflow/Workflow.ts

import { Artifact, ArtifactType } from './Artifact';
import { Stage } from './Stage';
import { DecisionPoint } from './DecisionPoint';

/**
 * Represents a node in the workflow graph.
 * It can be either a Stage or a DecisionPoint.
 */
export type WorkflowNode = Stage | DecisionPoint;

/**
 * Defines the structure of an edge in the workflow graph.
 * For simple linear workflows, this might be implicit. For complex graphs, explicit edges are needed.
 * Edges connect an output of one node (Stage or DecisionPoint outcome) to the input of another node.
 */
export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  // Optional: condition for the edge, if not handled by DecisionPoint's routingConditions directly
  // This could be useful if a Stage can have multiple conditional outputs.
  condition?: string; // e.g., "onSuccess", "onFailure", or a key matching a DecisionPoint outcome
  // Optional: mapping of artifacts if needed, though often implicit (output of source becomes input of target)
  // artifactMapping?: { [targetInputName: string]: string /* sourceOutputName or artifactId */ };
}


/**
 * Represents a complete workflow definition.
 * A workflow is a directed graph of Stages and DecisionPoints designed to accomplish a task.
 */
export interface Workflow {
  id: string; // Unique identifier for the workflow definition (e.g., "Verified-SIR-R1-Assert")
  name: string; // Human-readable name for the workflow
  description?: string; // Optional longer description
  version?: string; // Version of this workflow definition

  // The starting point of the workflow.
  startNodeId: string; // ID of the first Stage or DecisionPoint to execute

  // All nodes (Stages and DecisionPoints) in this workflow, indexed by their ID.
  nodes: Record<string, WorkflowNode>;

  // Optional: Explicit edges for defining complex graph structures.
  // If not provided, a linear sequence of nodes (based on some ordering or convention) might be assumed by the orchestrator.
  // For workflows with branching (DecisionPoints), edges are crucial.
  edges?: WorkflowEdge[];

  // Defines the expected input artifacts for the entire workflow.
  // This helps in validating if the workflow is called with the correct initial data.
  expectedInputArtifacts: Array<{
    name: string; // A logical name for the input (e.g., "userNaturalLanguageText")
    type: ArtifactType;
    description?: string;
  }>;

  // Defines the output artifacts produced by the entire workflow upon successful completion.
  // This helps users understand what to expect as a result.
  // The actual output artifact will come from one of the terminal nodes.
  expectedOutputArtifacts: Array<{
    name: string; // A logical name for the output (e.g., "prologClauses")
    type: ArtifactType;
    description?: string;
    // Optional: which node's output corresponds to this workflow output
    // sourceNodeOutput?: string; // e.g., "stage_synthesize_prolog.output"
  }>;

  // Metadata about the workflow, e.g., author, creationDate, tags for strategy selection
  metadata?: {
    author?: string;
    createdAt?: Date;
    updatedAt?: Date;
    tags?: string[]; // e.g., ["assertion", "robust", "SIR-based"]
    powerLevel?: 'Fast' | 'Balanced' | 'Robust'; // If this workflow is tied to a specific power level
  };
}


// --- Workflow Creator Utility Function (optional) ---
// import { v4 as uuidv4 } from 'uuid';
// ...

/**
 * Example:
 * For a simple linear workflow like Direct-S1:
 * Workflow:
 *  startNodeId: "stage_nl_to_prolog"
 *  nodes: { "stage_nl_to_prolog": DirectS1Stage }
 *  edges: (implicitly, none needed if orchestrator handles single stage)
 *
 * For Verified-SIR-R1:
 * Workflow:
 *  startNodeId: "stage_translate_nl_to_sir"
 *  nodes: {
 *    "stage_translate_nl_to_sir": Stage1_NLToSIR,
 *    "stage_verify_sir_to_nl": Stage2_SIRToNL,
 *    "dp_critique_translation": DecisionPoint_Critique,
 *    "stage_synthesize_prolog": Stage4_SIRToProlog,
 *    "stage_clarify_failure": Stage5_GenerateClarification
 *  }
 *  edges: [
 *    { source: "stage_translate_nl_to_sir", target: "stage_verify_sir_to_nl" },
 *    { source: "stage_verify_sir_to_nl", target: "dp_critique_translation" },
 *    // DecisionPoint handles its own output routing based on internal logic,
 *    // but edges could also explicitly model this:
 *    // { source: "dp_critique_translation", target: "stage_synthesize_prolog", condition: "pass" },
 *    // { source: "dp_critique_translation", target: "stage_clarify_failure", condition: "fail" }
 *  ]
 * (Note: The DecisionPoint's `routingConditions` provide the targets, so explicit edges from a DP might be redundant
 *  if the orchestrator uses that. Edges are more for connecting Stage-to-Stage or Stage-to-DP.)
 */
