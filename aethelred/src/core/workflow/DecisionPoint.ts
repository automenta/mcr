// aethelred/src/core/workflow/DecisionPoint.ts

import { Artifact, ArtifactType, CritiqueResultArtifact } from './Artifact';
import { Action, SemanticCompareAction } from './Action'; // Assuming critique might use a SemanticCompareAction or a specialized one

/**
 * Represents a node in the workflow that routes to different next steps (Stages or other DecisionPoints)
 * based on the content of an input Artifact, typically the result of a critique or evaluation.
 */
export interface DecisionPoint {
  id: string; // Unique identifier for this decision point within a workflow definition
  name: string; // Human-readable name (e.g., "Critique Translation Quality")
  description?: string; // Optional longer description

  // The action that performs the evaluation leading to a decision.
  // This action is expected to produce an artifact (e.g., CritiqueResultArtifact)
  // that the routingConditions can evaluate.
  evaluationAction: Action; // Example: SemanticCompareAction, or a custom critique action

  // The artifact ID or a reference to the output of a previous stage that will be evaluated.
  // For simplicity, we can assume it takes the output of its direct predecessor in the graph.
  // inputArtifactRef: string;

  // Conditions and corresponding next node IDs (Stage or another DecisionPoint).
  // The key of the outer map could be the specific field of the critique artifact to check (e.g., "pass")
  // or a more complex condition name.
  // The key of the inner map is the value to match, and the value is the ID of the next node.
  // Example: routingConditions: { "pass": { "true": "successStageId", "false": "failureStageId" } }
  // A more flexible approach might use functions or expression strings.
  routingConditions: Array<{
    conditionName?: string; // e.g., "IfCritiquePasses", "IfScoreAboveThreshold"
    // A function that takes the output artifact from evaluationAction and returns a string key
    // This key is then used to find the nextNodeId in the outcomes map.
    // Or, a simpler structure:
    artifactFieldPath: string; // e.g., "content.pass" or "content.similarity"
    operator: '===' | '!==' | '>' | '<' | '>=' | '<=' | 'defined' | 'undefined';
    value?: any; // Value to compare against (not needed for 'defined'/'undefined')
    nextNodeId: string; // ID of the next Stage or DecisionPoint
  }>;

  defaultNextNodeId?: string; // Optional: if no conditions match, where to go next.
}


// --- DecisionPoint Creator Utility Function (optional) ---
// import { v4 as uuidv4 } from 'uuid';

// type DecisionPointFactoryParams = {
//   name: string;
//   evaluationAction: Action;
//   routingConditions: DecisionPoint['routingConditions'];
//   defaultNextNodeId?: string;
//   description?: string;
//   id?: string;
// }

// export function createDecisionPoint(params: DecisionPointFactoryParams): DecisionPoint {
//   return {
//     id: params.id || uuidv4(),
//     name: params.name,
//     description: params.description,
//     evaluationAction: params.evaluationAction,
//     routingConditions: params.routingConditions,
//     defaultNextNodeId: params.defaultNextNodeId,
//   };
// }

/**
 * Example of how a DecisionPoint might be structured for the "Verified-SIR-R1" strategy:
 *
 * Stage 3: Critique (Decision Point)
 *   Input: NL_Text (original), Generated_NL_Text (from SIR_TO_NL)
 *   Action: Semantic_Compare (between original NL_Text and Generated_NL_Text)
 *   Output: Critique_Result (Pass/Fail)
 *   Routing: If Pass, go to Stage 4. If Fail, go to Stage 5.
 */

// const critiqueDecisionPointExample: DecisionPoint = {
//   id: "dp_critique_sir_translation",
//   name: "Critique SIR to NL Translation",
//   evaluationAction: { // Instance of a SemanticCompareAction
//     type: ActionType.SEMANTIC_COMPARE,
//     parameters: {
//       comparisonMethod: "llm",
//       // Input artifact references would be handled by Orchestrator based on graph position
//       outputArtifactType: ArtifactType.CRITIQUE_RESULT,
//     }
//   } as SemanticCompareAction, // Cast to specific action type
//   routingConditions: [
//     {
//       conditionName: "If semantic comparison passes",
//       artifactFieldPath: "content.pass", // Assuming CritiqueResultArtifact.content has a 'pass' boolean
//       operator: "===",
//       value: true,
//       nextNodeId: "stage_synthesize_prolog" // ID of Stage 4
//     },
//     {
//       conditionName: "If semantic comparison fails",
//       artifactFieldPath: "content.pass",
//       operator: "===",
//       value: false,
//       nextNodeId: "stage_clarify_failure" // ID of Stage 5
//     }
//   ],
//   // defaultNextNodeId: "stage_clarify_failure" // Could also use a default
// };
