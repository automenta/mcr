import type { Workflow, WorkflowNode, WorkflowEdge } from './Workflow';
import type { Stage } from './Stage';
import type { DecisionPoint } from './DecisionPoint';
import type { Artifact, ArtifactType } from './Artifact';
import { createArtifact, UntypedDataArtifact } from './Artifact';
import type { Action, LlmGenerateAction, ProgrammaticTransformAction, ReasonerExecuteAction, SemanticCompareAction } from './Action';
import { ActionType } from './Action';
import type { ILlmProvider } from '../../interfaces/ILlmProvider';
import type { IReasonProvider } from '../../interfaces/IReasonProvider';
import type { ISession } from '../knowledge/Session'; // May be needed for context

// Type for a registry of programmatic transformers
export type ProgrammaticTransformerRegistry = Map<string, ProgrammaticTransformFunction<any, any>>;
export type ProgrammaticTransformFunction<Input extends Artifact[], Output extends Artifact> =
  (inputs: Input, parameters: any, context: WorkflowExecutionContext) => Promise<Output>;


export interface WorkflowExecutionContext {
  llmProvider: ILlmProvider;
  reasonProvider: IReasonProvider;
  // session?: ISession; // Optional: if actions need session context
  // config?: MCRConfig; // Optional: if actions need global config
  programmaticTransformers: ProgrammaticTransformerRegistry;
  // TODO: Add a logger
}

/**
 * Executes a defined workflow.
 */
export class WorkflowExecutor {
  private context: WorkflowExecutionContext;

  constructor(context: WorkflowExecutionContext) {
    this.context = context;
  }

  public async execute(
    workflow: Workflow,
    initialArtifacts: Map<string, Artifact> // Keyed by expected input name
  ): Promise<Map<string, Artifact>> { // Returns a map of *workflow output artifacts* keyed by their expected output name

    // 1. Initial Input Validation
    for (const expectedIn of workflow.expectedInputArtifacts) {
      const providedArtifact = initialArtifacts.get(expectedIn.name);
      if (!providedArtifact) {
        throw new Error(`WorkflowExecutor: Missing expected initial artifact "${expectedIn.name}" for workflow "${workflow.id}".`);
      }
      if (providedArtifact.type !== expectedIn.type) {
        console.warn(`WorkflowExecutor: Type mismatch for initial artifact "${expectedIn.name}" for workflow "${workflow.id}". Expected ${expectedIn.type}, got ${providedArtifact.type}.`);
      }
    }

    // Internal map to store all artifacts generated during execution, keyed by their unique ID or a conventional stage output ID.
    const allExecutedArtifacts = new Map<string, Artifact>();
    initialArtifacts.forEach((artifact, name) => {
      allExecutedArtifacts.set(artifact.id, artifact); // Store by actual ID
      allExecutedArtifacts.set(`initial:${name}`, artifact); // Store by initial name for potential lookup
    });

    let currentNodeId: string | undefined = workflow.startNodeId;
    const executedNodeIds = new Set<string>(); // To detect loops

    // Simple loop prevention for now
    let iterationCount = 0;
    const maxIterations = (workflow.nodes ? Object.keys(workflow.nodes).length : 0) + 10; // Allow some leeway

    while (currentNodeId && iterationCount < maxIterations) {
      iterationCount++;
      if (executedNodeIds.has(currentNodeId) && !this.isDecisionPoint(workflow.nodes[currentNodeId])) {
        // Basic re-execution prevention for stages unless it's a loop via decision point
        // More sophisticated loop handling might be needed
        console.warn(`WorkflowExecutor: Attempting to re-execute stage ${currentNodeId}. Stopping to prevent infinite loop.`);
        throw new Error(`Workflow loop detected or stage re-execution attempt at node ${currentNodeId}.`);
      }

      const currentNode = workflow.nodes[currentNodeId];
      if (!currentNode) {
        throw new Error(`WorkflowExecutor: Node ID ${currentNodeId} not found in workflow definition.`);
      }

      executedNodeIds.add(currentNodeId);
      let nextNodeIdOverride: string | undefined = undefined;

      if (this.isStage(currentNode)) {
        // console.log(`WorkflowExecutor: Executing Stage ${currentNode.id} (${currentNode.name})`);
        try {
          const outputArtifact = await this.executeStage(currentNode, allExecutedArtifacts); // Use allExecutedArtifacts
          allExecutedArtifacts.set(`${currentNode.id}.output`, outputArtifact); // Store by stage_id.output
          allExecutedArtifacts.set(outputArtifact.id, outputArtifact); // Store by artifact_id
          // console.log(`WorkflowExecutor: Stage ${currentNode.id} produced artifact ${outputArtifact.id} of type ${outputArtifact.type}`);
        } catch (error: any) {
          console.error(`WorkflowExecutor: Error executing stage ${currentNode.id}: ${error.message}`);
          // TODO: Implement error handling strategies (e.g., fallbackStageId)
          throw error; // Re-throw for now
        }
      } else if (this.isDecisionPoint(currentNode)) {
        // console.log(`WorkflowExecutor: Executing DecisionPoint ${currentNode.id} (${currentNode.name})`);
        try {
          const evaluationOutputArtifact = await this.executeAction(currentNode.evaluationAction, allExecutedArtifacts, currentNode.id); // Use allExecutedArtifacts
          allExecutedArtifacts.set(`${currentNode.id}.evaluationOutput`, evaluationOutputArtifact); // Store by decisionpoint_id.evaluationOutput
          allExecutedArtifacts.set(evaluationOutputArtifact.id, evaluationOutputArtifact); // Store by artifact_id
          // console.log(`WorkflowExecutor: DecisionPoint ${currentNode.id} evaluation produced artifact ${evaluationOutputArtifact.id}`);

          nextNodeIdOverride = this.evaluateDecisionPoint(currentNode, evaluationOutputArtifact);
          if (!nextNodeIdOverride) {
             throw new Error(`WorkflowExecutor: DecisionPoint ${currentNode.id} could not determine next node.`);
          }
          // console.log(`WorkflowExecutor: DecisionPoint ${currentNode.id} routing to ${nextNodeIdOverride}`);
        } catch (error: any) {
          console.error(`WorkflowExecutor: Error executing decision point ${currentNode.id}: ${error.message}`);
          throw error;
        }
      } else {
        throw new Error(`WorkflowExecutor: Unknown node type for node ID ${currentNodeId}.`);
      }

      if (nextNodeIdOverride) {
        currentNodeId = nextNodeIdOverride;
      } else {
        // Find next node based on edges or linear progression
        // This simple version assumes linear progression if no explicit edge from current node.
        // For actual graph traversal, edge logic is needed.
        const outgoingEdges = workflow.edges?.filter(edge => edge.sourceNodeId === currentNodeId);
        if (outgoingEdges && outgoingEdges.length > 0) {
          if (outgoingEdges.length > 1) {
            // This should ideally be handled by a DecisionPoint or a stage with conditional outputs
            console.warn(`WorkflowExecutor: Node ${currentNodeId} has multiple outgoing edges but is not a DecisionPoint. Taking the first one.`);
          }
          currentNodeId = outgoingEdges[0].targetNodeId;
        } else {
          // If no explicit edge, try to find next node in sequence (if nodes are ordered) or end.
          // This part needs robust definition if workflows aren't always fully specified by edges.
          // For now, if no edge, assume end of workflow.
          const nodeIds = Object.keys(workflow.nodes);
          const currentIndex = nodeIds.indexOf(currentNodeId);
          if (currentIndex !== -1 && currentIndex < nodeIds.length - 1 && !workflow.edges) {
             // This is a naive linear progression, only use if no edges are defined at all
             // console.warn("WorkflowExecutor: Assuming linear progression due to lack of explicit edges.");
             // currentNodeId = nodeIds[currentIndex + 1];
             currentNodeId = undefined; // Prefer explicit edges or end
          } else {
            currentNodeId = undefined; // End of workflow
          }
        }
      }
      if (!currentNodeId) {
        // console.log("WorkflowExecutor: Reached end of workflow.");
      }
    }

    if (iterationCount >= maxIterations) {
        throw new Error("WorkflowExecutor: Exceeded maximum iterations, possible infinite loop.");
    }

    // Filter artifacts to return only the expected outputs, if defined
    const outputResults = new Map<string, Artifact>();
    if (workflow.expectedOutputArtifacts && workflow.expectedOutputArtifacts.length > 0) {
      for (const expectedOut of workflow.expectedOutputArtifacts) {
        // Find the artifact that corresponds to this expected output.
        // This requires a convention: e.g., the output of the last node, or a node named in `expectedOut.sourceNodeOutput`.
        // For simplicity, let's assume the `expectedOut.name` is a key in `allExecutedArtifacts`
        // (e.g., set by a stage like `allExecutedArtifacts.set(expectedOut.name, outputArtifact)`).
        // This part needs refinement based on how outputs are named/referenced.
        // A common pattern: the artifact ID itself or `stageId.output`.
        // Let's try to find an artifact whose metadata indicates it's the named output, or fallback to last node output.

        let foundOutputArtifact: Artifact | undefined = undefined;
        // Try to find an artifact whose ID was explicitly set to the expected output name
        // (this is a convention that the workflow definition or stages would need to follow)
        if(allExecutedArtifacts.has(expectedOut.name)) {
            foundOutputArtifact = allExecutedArtifacts.get(expectedOut.name);
        } else {
            // Fallback: find an artifact produced by a stage that matches expectedOut.sourceNodeOutput (if specified)
            // Or, more generically, find an artifact of the correct type if only one is expected.
            // This is still rough. The most robust way is if a stage producing an output explicitly names it.
            // For now, if only one expected output, assume the last stage's output is it.
            if (workflow.expectedOutputArtifacts.length === 1) {
                 const lastNodeId = Array.from(executedNodeIds).pop(); // This is not necessarily the "final" output node in complex graphs
                 if (lastNodeId) {
                    foundOutputArtifact = allExecutedArtifacts.get(`${lastNodeId}.output`) || allExecutedArtifacts.get(`${lastNodeId}.evaluationOutput`);
                 }
            }
            // If a specific source is named in expectedOutputArtifacts.sourceNodeOutput (e.g. "stageName.output")
            if (expectedOut.metadata?.sourceNodeOutput && allExecutedArtifacts.has(expectedOut.metadata.sourceNodeOutput)) {
                foundOutputArtifact = allExecutedArtifacts.get(expectedOut.metadata.sourceNodeOutput);
            }
        }


        if (foundOutputArtifact && foundOutputArtifact.type === expectedOut.type) {
          outputResults.set(expectedOut.name, foundOutputArtifact);
        } else if (foundOutputArtifact) {
          console.warn(`WorkflowExecutor: Type mismatch for expected output artifact "${expectedOut.name}". Expected ${expectedOut.type}, got ${foundOutputArtifact.type}.`);
          // Still include it if found by name, but with a warning.
          outputResults.set(expectedOut.name, foundOutputArtifact);
        } else {
          console.warn(`WorkflowExecutor: Expected output artifact "${expectedOut.name}" not found or not produced by the workflow.`);
          // Optionally, throw an error if strict output adherence is required.
          // throw new Error(`Expected output artifact "${expectedOut.name}" not found.`);
        }
      }
       if (outputResults.size === 0 && workflow.expectedOutputArtifacts.length > 0) {
        // If no named outputs were resolved but some were expected, this is an issue with workflow definition or execution.
        // console.warn("WorkflowExecutor: No expected outputs were resolved by name. Check workflow definition and stage output naming.");
      }
      return outputResults;
    } else {
      // If no expected outputs are defined, return all artifacts produced by stages/decision points (not initial ones).
      const nonInitialArtifacts = new Map<string, Artifact>();
      allExecutedArtifacts.forEach((artifact, key) => {
        if (!key.startsWith("initial:")) { // Exclude those keyed as initial inputs
            // Check if it's an output of a node
            if (key.includes(".output") || key.includes(".evaluationOutput")) {
                 nonInitialArtifacts.set(key, artifact);
            } else {
                // If it's an artifact stored by its own ID, check if it was produced by a node
                const wasProducedByNode = Array.from(executedNodeIds).some(nodeId =>
                    allExecutedArtifacts.get(`${nodeId}.output`) === artifact ||
                    allExecutedArtifacts.get(`${nodeId}.evaluationOutput`) === artifact
                );
                if (wasProducedByNode) {
                    nonInitialArtifacts.set(artifact.id, artifact); // Store by its actual ID if it's a produced one
                }
            }
        }
      });
      return nonInitialArtifacts.size > 0 ? nonInitialArtifacts : allExecutedArtifacts; // Fallback to all if filtering yields nothing (e.g. single stage workflow)
    }
  }

  private isStage(node: WorkflowNode): node is Stage {
    return 'action' in node;
  }

  private isDecisionPoint(node: WorkflowNode): node is DecisionPoint {
    return 'evaluationAction' in node && 'routingConditions' in node;
  }

  private resolveInputArtifacts(action: Action, availableArtifacts: Map<string, Artifact>, nodeId: string): Artifact[] {
    // This is a placeholder. Real implementation needs to map action's input requirements
    // (which are not yet fully defined on the Action interface) to available artifacts.
    // For now, let's assume an action might try to find its inputs by conventional names
    // or that the stage definition provides this mapping.

    // Example: if an action expects an "NL_TEXT" artifact, find one.
    // This is highly simplistic and needs a proper mapping mechanism.
    // For LlmGenerateAction, it might take one primary input.
    // For ProgrammaticTransformAction, it could take multiple.

    // A common pattern: previous stage's output is the input to the current.
    // Let's find the "producing" node for this node based on edges.
    // This is still too simple. Input mapping needs to be part of Stage/Action definition.
    // For now, we'll pass all available artifacts and let the action execution logic pick.
    // This is not ideal but allows progress.

    // A slightly better temporary approach: find the output of the immediate predecessor.
    // This assumes a linear chain or that the graph traversal logic correctly identifies the predecessor.
    // This is complex due to branching.

    // Simplest for now: assume the action itself will declare what it needs,
    // and the executeAction method will try to fulfill that from `availableArtifacts`.
    // This is deferred to `executeAction`.

    // For now, returning a default or letting executeAction handle it.
    // This part is critical and needs a robust solution.
    // Let's assume for now that the action execution logic will look up named inputs.
    return Array.from(availableArtifacts.values()); // Pass all for now, action handlers must filter.
  }


  private async executeStage(stage: Stage, availableArtifacts: Map<string, Artifact>): Promise<Artifact> {
    // The `resolveInputArtifacts` call should happen here or inside `executeAction`
    // based on `stage.inputMappings` (if we add that feature)
    return this.executeAction(stage.action, availableArtifacts, stage.id);
  }

  private async executeAction(action: Action, availableArtifacts: Map<string, Artifact>, parentNodeId: string): Promise<Artifact> {
    // The `inputs` here are ALL available artifacts. The specific action handlers
    // will need to pick the ones they need based on some convention or explicit mapping
    // defined in the Action or Stage. This is a simplification for now.
    const inputs = Array.from(availableArtifacts.values());

    switch (action.type) {
      case ActionType.LLM_GENERATE:
        return this.executeLlmGenerateAction(action as LlmGenerateAction, inputs, parentNodeId);
      case ActionType.PROGRAMMATIC_TRANSFORM:
        return this.executeProgrammaticTransformAction(action as ProgrammaticTransformAction, inputs, parentNodeId);
      case ActionType.REASONER_EXECUTE:
        return this.executeReasonerExecuteAction(action as ReasonerExecuteAction, inputs, parentNodeId);
      case ActionType.SEMANTIC_COMPARE:
         return this.executeSemanticCompareAction(action as SemanticCompareAction, inputs, parentNodeId);
      default:
        // This check should ideally be caught by TypeScript if Action is a discriminated union
        // and all cases are handled. If not, `action` could be `never`.
        const exhaustiveCheck: never = action;
        throw new Error(`WorkflowExecutor: Unknown action type: ${(exhaustiveCheck as Action).type}`);
    }
  }

  private async executeLlmGenerateAction(action: LlmGenerateAction, inputs: Artifact[], parentNodeId: string): Promise<Artifact> {
    // Simplistic input finding: find the first NL_TEXT artifact if no specific mapping.
    // This needs to be made more robust, e.g. action.parameters.inputArtifactName
    const primaryInput = inputs.find(a => a.type === 'NL_Text'); // Or use action.parameters.inputArtifactRef

    let promptText = action.parameters.directUserPrompt || '';
    if (action.parameters.directUserPrompt?.includes("{inputText}") && primaryInput && primaryInput.type === "NL_Text") {
        promptText = action.parameters.directUserPrompt.replace("{inputText}", primaryInput.content as string);
    } else if (primaryInput && primaryInput.type === "NL_Text" && !action.parameters.directUserPrompt) {
        // If no directUserPrompt template, but there is an NL_Text input, use its content as prompt.
        promptText = primaryInput.content as string;
    } else if (!primaryInput && !action.parameters.directUserPrompt?.includes("{inputText}")) {
        // Use directUserPrompt as is, if it doesn't expect an input variable we don't have
    } else if (!primaryInput && action.parameters.directUserPrompt?.includes("{inputText}")) {
        throw new Error(`LLMGenerateAction in ${parentNodeId} expects an input text artifact for prompt template, but none found or suitable.`);
    }


    // console.log(`WorkflowExecutor: LLMGenerateAction for ${parentNodeId} with prompt: "${promptText.substring(0,100)}..."`);

    const llmResponse = await this.context.llmProvider.generate(
      promptText,
      action.parameters.directSystemPrompt // Pass system prompt if provided
    );

    return createArtifact(action.parameters.outputArtifactType, {
      content: llmResponse, // Content type depends on outputArtifactType, might need parsing if JSON
      metadata: { sourceNode: parentNodeId, llmProvider: this.context.llmProvider.getName() }
    });
  }

  private async executeProgrammaticTransformAction(action: ProgrammaticTransformAction, inputs: Artifact[], parentNodeId: string): Promise<Artifact> {
    const transformerName = action.parameters.transformerName;
    if (!transformerName) {
      throw new Error(`ProgrammaticTransformAction in ${parentNodeId} is missing 'transformerName'.`);
    }
    const transformFunction = this.context.programmaticTransformers.get(transformerName);
    if (!transformFunction) {
      throw new Error(`ProgrammaticTransformAction in ${parentNodeId}: No transformer registered for name '${transformerName}'.`);
    }

    // Input resolution for programmatic actions also needs to be more robust.
    // For now, passing all inputs and letting the transformer pick.
    // The specific transformer function will need to know what artifacts to expect.
    const outputArtifact = await transformFunction(inputs, action.parameters, this.context);

    if (outputArtifact.type !== action.parameters.outputArtifactType) {
        console.warn(`ProgrammaticTransformAction in ${parentNodeId} for ${transformerName}: Expected output type ${action.parameters.outputArtifactType} but got ${outputArtifact.type}.`);
    }

    // Enrich metadata
    outputArtifact.metadata = {
        ...outputArtifact.metadata,
        sourceNode: parentNodeId,
        transformerName
    };
    return outputArtifact;
  }

  private async executeReasonerExecuteAction(action: ReasonerExecuteAction, inputs: Artifact[], parentNodeId: string): Promise<Artifact> {
    const queryArtifact = inputs.find(a => a.type === action.parameters.queryArtifactType); // e.g. QUERY_STRING
    const kbArtifact = action.parameters.knowledgeBaseArtifactType
      ? inputs.find(a => a.type === action.parameters.knowledgeBaseArtifactType) // e.g. PROLOG_KB
      : undefined;

    if (!queryArtifact) {
      throw new Error(`ReasonerExecuteAction in ${parentNodeId}: Required query artifact of type ${action.parameters.queryArtifactType} not found.`);
    }
    if (action.parameters.knowledgeBaseArtifactType && !kbArtifact && !action.parameters.sessionId) {
        throw new Error(`ReasonerExecuteAction in ${parentNodeId}: KnowledgeBase artifact type ${action.parameters.knowledgeBaseArtifactType} specified but not found, and no sessionId provided.`);
    }

    let kbString = "";
    if (kbArtifact) {
        kbString = kbArtifact.content as string;
    } else if (action.parameters.sessionId) {
        // TODO: Need a way to get session's KB string.
        // This requires WorkflowExecutor or context to have access to session manager.
        // For now, this path will fail if not handled by specific ReasonProvider.
        throw new Error("ReasonerExecuteAction with sessionId not fully implemented yet in WorkflowExecutor.");
    }

    const query = queryArtifact.content as string;
    const queryResult = await this.context.reasonProvider.query(kbString, query);

    return createArtifact("Query_Result" as ArtifactType.QUERY_RESULT, { // Cast needed due to string literal type
      content: queryResult,
      metadata: { sourceNode: parentNodeId, reasonerProvider: this.context.reasonProvider.getName() }
    });
  }

  private async executeSemanticCompareAction(action: SemanticCompareAction, inputs: Artifact[], parentNodeId: string): Promise<Artifact<ArtifactType.CRITIQUE_RESULT, any>> {
    // Needs robust input selection. Assume first two text artifacts for now.
    const textArtifacts = inputs.filter(a => a.type === "NL_Text" || a.type === "NL_Explanation");
    if (textArtifacts.length < 2) {
        throw new Error(`SemanticCompareAction in ${parentNodeId} requires at least two text-based artifacts for comparison.`);
    }

    const text1 = textArtifacts[0].content as string;
    const text2 = textArtifacts[1].content as string;

    // This is a placeholder for actual semantic comparison logic.
    // It might involve LLM calls, embedding comparisons, etc.
    // For now, a simple string comparison or a mock LLM call.

    let pass = false;
    let details = "Comparison not fully implemented.";
    let similarity: number | undefined = undefined;

    if (action.parameters.comparisonMethod === 'llm') {
        const comparePrompt = `Are the following two texts semantically similar? Respond with "Pass" or "Fail".
Text 1: "${text1}"
Text 2: "${text2}"`;
        const llmResponse = await this.context.llmProvider.generate(comparePrompt, "You are a text comparison expert.");
        pass = llmResponse.toLowerCase().includes("pass");
        details = `LLM comparison result: ${llmResponse}`;
    } else { // Default to exact match for now
        pass = text1 === text2;
        similarity = pass ? 1 : 0;
        details = pass ? "Texts are identical." : "Texts are different.";
    }

    return createArtifact(ArtifactType.CRITIQUE_RESULT, {
        content: { pass, details, similarity },
        metadata: { sourceNode: parentNodeId, method: action.parameters.comparisonMethod || 'default' }
    });
  }


  private evaluateDecisionPoint(decisionPoint: DecisionPoint, evaluationArtifact: Artifact): string | undefined {
    for (const route of decisionPoint.routingConditions) {
      // Resolve the value from the artifact using artifactFieldPath
      // e.g., "content.pass" or "content.similarityScore"
      let actualValue: any = evaluationArtifact;
      try {
        for (const part of route.artifactFieldPath.split('.')) {
          if (actualValue && typeof actualValue === 'object' && part in actualValue) {
            actualValue = actualValue[part];
          } else {
            actualValue = undefined; // Path not found
            break;
          }
        }
      } catch (e) {
        actualValue = undefined; // Error during path traversal
        console.warn(`Error accessing path ${route.artifactFieldPath} in artifact ${evaluationArtifact.id}`);
      }


      let conditionMet = false;
      switch (route.operator) {
        case '===': conditionMet = actualValue === route.value; break;
        case '!==': conditionMet = actualValue !== route.value; break;
        case '>': conditionMet = typeof actualValue === 'number' && typeof route.value === 'number' && actualValue > route.value; break;
        case '<': conditionMet = typeof actualValue === 'number' && typeof route.value === 'number' && actualValue < route.value; break;
        case '>=': conditionMet = typeof actualValue === 'number' && typeof route.value === 'number' && actualValue >= route.value; break;
        case '<=': conditionMet = typeof actualValue === 'number' && typeof route.value === 'number' && actualValue <= route.value; break;
        case 'defined': conditionMet = actualValue !== undefined; break;
        case 'undefined': conditionMet = actualValue === undefined; break;
        default:
          console.warn(`WorkflowExecutor: Unknown operator ${route.operator} in DecisionPoint ${decisionPoint.id}`);
      }

      if (conditionMet) {
        return route.nextNodeId;
      }
    }
    return decisionPoint.defaultNextNodeId;
  }
}
