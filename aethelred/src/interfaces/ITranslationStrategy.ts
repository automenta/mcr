// aethelred/src/interfaces/ITranslationStrategy.ts

import type { Workflow } from '../core/workflow/Workflow.js';
import type { Artifact, NLTextArtifact } from '../core/workflow/Artifact.js';

/**
 * A strategy is responsible for defining a Workflow to achieve a specific reasoning task
 * (e.g., asserting facts, answering a query) based on some input.
 */
export interface ITranslationStrategy {
  /**
   * Returns the unique name of the strategy (e.g., "Direct-S1", "Verified-SIR-R1").
   * This name can be used by the StrategySelector.
   */
  getName(): string;

  /**
   * Defines a workflow for asserting natural language text into the knowledge base.
   * @param nlTextArtifact The natural language text artifact to be asserted.
   * @param context Optional: Additional context artifacts (e.g., session info, ontology hints).
   * @returns A Workflow definition object.
   */
  defineAssertWorkflow(
    nlTextArtifact: NLTextArtifact,
    context?: Map<string, Artifact>
  ): Workflow;

  /**
   * Defines a workflow for querying the knowledge base using a natural language question.
   * @param nlQuestionArtifact The natural language question artifact.
   * @param context Optional: Additional context artifacts.
   * @returns A Workflow definition object.
   */
  defineQueryWorkflow(
    nlQuestionArtifact: NLTextArtifact,
    context?: Map<string, Artifact>
  ): Workflow;
}
