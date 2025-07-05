// aethelred/src/core/orchestration/McrOrchestrator.ts

import type { Workflow, WorkflowNode, WorkflowEdge } from '../workflow/Workflow.js';
import { ArtifactType, createArtifact } from '../workflow/Artifact.js'; // createArtifact is a value, ArtifactType enum
import type { Artifact } from '../workflow/Artifact.js'; // Artifact is a type
import type { Stage } from '../workflow/Stage.js';
import type { DecisionPoint } from '../workflow/DecisionPoint.js';
// import type { ExecutionEngine } from '../execution/ExecutionEngine'; // TODO: When placeholder removed and ExecutionEngine is concrete
import { v4 as uuidv4 } from 'uuid'; // uuidv4 is a value

// Assuming ExecutionEngine.ts is in the peer directory and exports the class
import { ExecutionEngine } from '../execution/ExecutionEngine.js';


export class McrOrchestrator {
  private executionEngine: ExecutionEngine;

  constructor(executionEngine: ExecutionEngine) {
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
      const nodeInputDefinitions = 'action' in currentNode ? (currentNode as Stage).inputArtifactNames :
                                   (currentNode as DecisionPoint).inputArtifactName ? [(currentNode as DecisionPoint).inputArtifactName] : [];

      if (nodeInputDefinitions && nodeInputDefinitions.length > 0) {
          for (const inputName of nodeInputDefinitions) {
              // Priority: Output from a previous node > Initial workflow artifact
              let foundInput: Artifact | undefined = undefined;

              // Search in nodeOutputs by output name (more complex mapping might be needed if output names differ from required input names)
              // This current search in nodeOutputs relies on the Stage.outputArtifactName being used as a key
              // or the node ID itself if the output name is not consistently used as a key in nodeOutputs.
              // For simplicity, let's assume stage.outputArtifactName is what we'd look for.
              // However, nodeOutputs is keyed by node ID. We need to find which *previous* node produced an artifact *named* inputName.
              // This requires a more robust way to map Stage.outputArtifactName to the artifact itself.
              // For now, let's check initial artifacts first, then iterate outputs.

              if (initialArtifactsMap.has(inputName)) {
                  foundInput = initialArtifactsMap.get(inputName);
              } else {
                  // Find if any executed node produced an output artifact that matches this inputName.
                  // This is tricky if inputName is generic e.g. "textInput" and multiple stages output "textInput".
                  // The workflow definition should ensure unique names or the orchestrator needs a clear way
                  // to get the output of a *specific connected* previous node.
                  // A simpler model: edges could specify which output artifact of a source node maps to which input of a target.
                  // Current model: edges connect nodes, output of source node becomes *an* input to target.

                  // Let's find the node that is supposed to provide this input via an edge.
                  const providingEdge = workflow.edges?.find(edge => edge.targetNodeId === currentNodeId && edge.targetInputName === inputName);
                  if (providingEdge && nodeOutputs.has(providingEdge.sourceNodeId)) {
                       // This assumes the edge directly provides the artifact from the source node's single output.
                       // And that the targetInputName on the edge matches the expected inputName.
                      foundInput = nodeOutputs.get(providingEdge.sourceNodeId);
                      if (foundInput && workflow.nodes[providingEdge.sourceNodeId]?.outputArtifactName !== inputName && !providingEdge.sourceOutputName) {
                        // If the generic output of the source node is being implicitly mapped, this is fine.
                        // If sourceOutputName was specified on edge, it should match.
                      }
                  } else {
                      // Fallback: search all previous outputs. This is ambiguous if names collide.
                      // This part is weak and needs better definition of how named inputs are resolved from multiple previous outputs.
                      // For now, we assume if it's not an initial artifact, it must come from the single output of the immediate predecessor on any incoming edge.
                      // This was the old logic, let's try to improve slightly.
                      // Find *any* incoming edge and use its source's output if the input isn't in initialArtifactsMap
                      // If no specific providingEdge, check if the inputName is directly available in nodeOutputs
                      // (i.e., an output from a previous stage was named this)
                      if (nodeOutputs.has(inputName)) {
                        foundInput = nodeOutputs.get(inputName);
                      } else {
                        // Fallback: If still not found, try the less specific "anyIncomingEdge" logic (original fallback)
                        // This part is kept for cases where input names are not explicitly defined or mapped via outputArtifactName.
                        const anyIncomingEdge = workflow.edges?.find(edge => edge.targetNodeId === currentNodeId);
                        if (anyIncomingEdge && nodeOutputs.has(anyIncomingEdge.sourceNodeId)) {
                            const potentialInput = nodeOutputs.get(anyIncomingEdge.sourceNodeId);
                            if (potentialInput) {
                                if (nodeInputDefinitions.length === 1 && nodeInputDefinitions[0] === inputName) { // If node expects one input and this is its name
                                    foundInput = potentialInput;
                                } else {
                                    // Check if the producer node named its output as inputName
                                    const producerNode = workflow.nodes[anyIncomingEdge.sourceNodeId];
                                    if (producerNode && producerNode.outputArtifactName === inputName) {
                                        foundInput = potentialInput;
                                    } else if (nodeInputDefinitions.length === 1) {
                                        // If node expects one input and its name doesn't match, but we have an input from predecessor.
                                        // This is risky if the input name was important.
                                        // console.warn(`[McrOrchestrator] Using output of node ${anyIncomingEdge.sourceNodeId} for input ${inputName} based on single predecessor, though names might not match.`);
                                        // foundInput = potentialInput; // Keep this commented unless absolutely necessary, prefer named resolution.
                                    }
                                }
                            }
                        }
                      }
                  }
              }

              if (foundInput) {
                  currentInputs.push(foundInput);
              } else {
                  console.warn(`[McrOrchestrator] Could not resolve input artifact named "${inputName}" for node "${currentNode.name}" (ID: ${currentNodeId}). This may be an error if the input is required.`);
              }
          }
      } else if (currentNodeId !== workflow.startNodeId) {
        // Node has no specific input names defined, try to get input from a single direct predecessor.
        const incomingEdge = workflow.edges?.find(edge => edge.targetNodeId === currentNodeId);
        if (incomingEdge && nodeOutputs.has(incomingEdge.sourceNodeId)) {
            const sourceOutput = nodeOutputs.get(incomingEdge.sourceNodeId);
            if (sourceOutput) currentInputs = [sourceOutput];
        }
      }

      // If it's the start node and it expected specific inputs that weren't found (e.g. misnamed in initialArtifactsMap)
      // and currentInputs is still empty, this is an issue.
      // The previous fallback for start node was:
      // if (currentInputs.length === 0 && workflow.expectedInputArtifacts.length > 0 && currentNodeId === workflow.startNodeId && initialArtifactsMap.size > 0) {
      //   const fallbackInput = Array.from(initialArtifactsMap.values())[0];
      //   if (fallbackInput) currentInputs = [fallbackInput];
      // }
      // This is too naive. If specific inputs are named, they should be provided.

      if ('action' in currentNode) { // It's a Stage
        const stage = currentNode as Stage;
        if (stage.inputArtifactNames && stage.inputArtifactNames.length > currentInputs.length) {
            console.warn(`[McrOrchestrator] Stage "${stage.name}" expects ${stage.inputArtifactNames.length} inputs named (${stage.inputArtifactNames.join(', ')}), but only resolved ${currentInputs.length}. This might lead to errors.`);
        }
        const outputArtifact = await this.executionEngine.executeStage(stage, currentInputs);
        // Store output by its given name if the stage defines one, otherwise by stage ID.
        const outputKey = stage.outputArtifactName ? stage.outputArtifactName : stage.id;
        workflowArtifacts.set(outputArtifact.id, outputArtifact); // Keep all artifacts by ID
        nodeOutputs.set(stage.id, outputArtifact); // Output of the node, keyed by node ID
        if(stage.outputArtifactName) {
            nodeOutputs.set(stage.outputArtifactName, outputArtifact); // Also store by defined output name for easier lookup
        }
        console.log(`[McrOrchestrator] Stage "${stage.name}" executed. Output artifact ID: ${outputArtifact.id} (Stored as output of node ${stage.id}${stage.outputArtifactName ? ' and named ' + stage.outputArtifactName : ''})`);
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
