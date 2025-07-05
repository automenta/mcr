// aethelred/src/core/orchestration/McrOrchestrator.ts

import type { Workflow, WorkflowNode, WorkflowEdge } from '../workflow/Workflow.js';
import { ArtifactType, createArtifact } from '../workflow/Artifact.js'; // createArtifact is a value, ArtifactType enum
import type { Artifact } from '../workflow/Artifact.js'; // Artifact is a type
import type { Stage } from '../workflow/Stage.js';
import type { DecisionPoint } from '../workflow/DecisionPoint.js';
// import type { ExecutionEngine } from '../execution/ExecutionEngine'; // TODO: When placeholder removed and ExecutionEngine is concrete
import { v4 as uuidv4 } from 'uuid'; // uuidv4 is a value

// Assuming ExecutionEngine.ts is in the peer directory and exports the class
import type { ExecutionEngine as ActualExecutionEngine } from '../execution/ExecutionEngine.js';
// Define PlaceholderExecutionEngine based on the actual ExecutionEngine's expected methods
type PlaceholderExecutionEngine = Pick<ActualExecutionEngine, 'executeStage' | 'executeDecisionPointEvaluation'>;


export class McrOrchestrator {
  private executionEngine: PlaceholderExecutionEngine;

  constructor(executionEngine: PlaceholderExecutionEngine) {
    this.executionEngine = executionEngine;
    // console.log("[McrOrchestrator] Initialized.");
  }

  public async executeWorkflow(
    workflow: Workflow,
    initialArtifactsMap: Map<string, Artifact>,
    sessionId?: string
  ): Promise<Map<string, Artifact>> {
    console.log(`[McrOrchestrator] Executing workflow: ${workflow.name} (ID: ${workflow.id})`);
    if (sessionId) {
      console.log(`[McrOrchestrator] Session ID: ${sessionId}`);
    }

    for (const expectedInput of workflow.expectedInputArtifacts) {
      const providedArtifact = initialArtifactsMap.get(expectedInput.name);
      if (!providedArtifact) {
        throw new Error(`[McrOrchestrator] Missing expected initial artifact: "${expectedInput.name}" for workflow "${workflow.name}".`);
      }
      if (providedArtifact.type !== expectedInput.type) {
        console.warn(`[McrOrchestrator] Type mismatch for initial artifact "${expectedInput.name}". Expected ${expectedInput.type}, got ${providedArtifact.type}. Proceeding cautiously.`);
      }
    }

    const workflowArtifacts = new Map<string, Artifact>();
    initialArtifactsMap.forEach(artifact => workflowArtifacts.set(artifact.id, artifact));

    const nodeOutputs = new Map<string, Artifact>();
    initialArtifactsMap.forEach((artifact, name) => nodeOutputs.set(`workflow_input:${name}`, artifact));

    let currentNodeId: string | undefined = workflow.startNodeId;
    let safetyBreak = 0;
    const maxNodesToVisit = Object.keys(workflow.nodes).length + (workflow.edges?.length || 0) + 10;

    while (currentNodeId && safetyBreak < maxNodesToVisit) {
      safetyBreak++;
      const currentNode = workflow.nodes[currentNodeId];

      if (!currentNode) {
        throw new Error(`[McrOrchestrator] Node ID "${currentNodeId}" not found in workflow "${workflow.name}".`);
      }

      console.log(`[McrOrchestrator] Current node: ${currentNode.name} (ID: ${currentNodeId}, Type: ${('action' in currentNode) ? 'Stage' : 'DecisionPoint'})`);

      let currentInputs: Artifact[] = [];
      if (currentNodeId === workflow.startNodeId) {
        if ('action' in currentNode) { // Stage
            currentInputs = Array.from(initialArtifactsMap.values());
        } else { // DecisionPoint
            const firstExpectedInputName = workflow.expectedInputArtifacts[0]?.name;
            const inputForDP = firstExpectedInputName ? initialArtifactsMap.get(firstExpectedInputName) : Array.from(initialArtifactsMap.values())[0];
            if (inputForDP) currentInputs = [inputForDP];
        }
      } else {
        const incomingEdge = workflow.edges?.find(edge => edge.targetNodeId === currentNodeId);
        if (incomingEdge) {
            const sourceOutput = nodeOutputs.get(incomingEdge.sourceNodeId);
            if (sourceOutput) currentInputs = [sourceOutput];
            else console.warn(`[McrOrchestrator] No output found from source node ${incomingEdge.sourceNodeId} for edge ${incomingEdge.id}`);
        } else if (nodeOutputs.size > initialArtifactsMap.size) {
            const lastOutput = Array.from(nodeOutputs.values()).filter(a => !initialArtifactsMap.has(a.id)).pop();
            if (lastOutput) currentInputs = [lastOutput];
        }
      }

      if (currentInputs.length === 0 && workflow.expectedInputArtifacts.length > 0 && currentNodeId === workflow.startNodeId && initialArtifactsMap.size > 0) {
        const fallbackInput = Array.from(initialArtifactsMap.values())[0];
        if (fallbackInput) currentInputs = [fallbackInput];
      }


      if ('action' in currentNode) { // It's a Stage
        const stage = currentNode as Stage;
        const outputArtifact = await this.executionEngine.executeStage(stage, currentInputs);
        workflowArtifacts.set(outputArtifact.id, outputArtifact);
        nodeOutputs.set(stage.id, outputArtifact);
        console.log(`[McrOrchestrator] Stage "${stage.name}" executed. Output artifact ID: ${outputArtifact.id}`);

        const outgoingEdge = workflow.edges?.find(edge => edge.sourceNodeId === stage.id);
        currentNodeId = outgoingEdge?.targetNodeId;

      } else { // It's a DecisionPoint
        const decisionPoint = currentNode as DecisionPoint;
        if (currentInputs.length === 0) {
            throw new Error(`[McrOrchestrator] DecisionPoint "${decisionPoint.name}" received no input for evaluation.`);
        }
        const evaluationInput = currentInputs[0];

        if (!evaluationInput) { // Explicit check to satisfy TS compiler if flow analysis is insufficient
            throw new Error(`[McrOrchestrator] Evaluation input for DP "${decisionPoint.name}" resolved to undefined unexpectedly after initial checks.`);
        }

        const evaluationOutputArtifact = await this.executionEngine.executeDecisionPointEvaluation(decisionPoint, evaluationInput);
        workflowArtifacts.set(evaluationOutputArtifact.id, evaluationOutputArtifact);
        nodeOutputs.set(decisionPoint.id, evaluationOutputArtifact);
        console.log(`[McrOrchestrator] DecisionPoint "${decisionPoint.name}" evaluation executed. Output artifact ID: ${evaluationOutputArtifact.id}`);

        let routed = false;
        for (const route of decisionPoint.routingConditions) {
          const content = evaluationOutputArtifact.content as any;
          const fieldValue = content && typeof route.artifactFieldPath === 'string' ? content[route.artifactFieldPath] : undefined;

          let conditionMet = false;
          const val = route.value;
          if (route.operator === '===') conditionMet = fieldValue === val;
          else if (route.operator === '!==') conditionMet = fieldValue !== val;
          else if (route.operator === '>') conditionMet = val !== undefined && fieldValue !== undefined && fieldValue > val;
          else if (route.operator === '<') conditionMet = val !== undefined && fieldValue !== undefined && fieldValue < val;
          else if (route.operator === '>=') conditionMet = val !== undefined && fieldValue !== undefined && fieldValue >= val;
          else if (route.operator === '<=') conditionMet = val !== undefined && fieldValue !== undefined && fieldValue <= val;
          else if (route.operator === 'defined') conditionMet = typeof fieldValue !== 'undefined';
          else if (route.operator === 'undefined') conditionMet = typeof fieldValue === 'undefined';

          if (conditionMet) {
            console.log(`[McrOrchestrator] DecisionPoint "${decisionPoint.name}" routing condition "${route.conditionName || route.artifactFieldPath}" met. Next node: ${route.nextNodeId}`);
            currentNodeId = route.nextNodeId;
            routed = true;
            break;
          }
        }
        if (!routed) {
          if (decisionPoint.defaultNextNodeId) {
            console.log(`[McrOrchestrator] DecisionPoint "${decisionPoint.name}" using default route. Next node: ${decisionPoint.defaultNextNodeId}`);
            currentNodeId = decisionPoint.defaultNextNodeId;
          } else {
            console.warn(`[McrOrchestrator] DecisionPoint "${decisionPoint.name}" did not meet any routing conditions and has no default route. Ending path.`);
            currentNodeId = undefined;
          }
        }
      }
    }

    if (safetyBreak >= maxNodesToVisit) {
        console.error(`[McrOrchestrator] Workflow execution aborted due to safety break. Last node ID was ${currentNodeId}`);
        throw new Error("Workflow execution safety break triggered.");
    }

    console.log(`[McrOrchestrator] Workflow "${workflow.name}" execution finished.`);

    const finalOutputMap = new Map<string, Artifact>();
    if (workflow.expectedOutputArtifacts.length > 0) {
        const lastWrittenNodeId = Array.from(nodeOutputs.keys()).filter(k => !k.startsWith("workflow_input:")).pop();
        if (lastWrittenNodeId) {
            const lastOutputArtifact = nodeOutputs.get(lastWrittenNodeId);
            const firstExpectedOutput = workflow.expectedOutputArtifacts[0];
            if (lastOutputArtifact && firstExpectedOutput) {
                finalOutputMap.set(firstExpectedOutput.name, lastOutputArtifact);
            }
        }
    }

    if (finalOutputMap.size === 0 && nodeOutputs.size > initialArtifactsMap.size) {
        console.warn(`[McrOrchestrator] Workflow "${workflow.name}" finished but no output was mapped to expected outputs. Providing last generated artifact as fallback.`);
        const lastOutputKey = Array.from(nodeOutputs.keys()).filter(k => !k.startsWith("workflow_input:")).pop();
        if (lastOutputKey) {
            const fallbackOutput = nodeOutputs.get(lastOutputKey);
            if (fallbackOutput) finalOutputMap.set("unnamed_workflow_output", fallbackOutput);
        }
    }
    return finalOutputMap;
  }
}
