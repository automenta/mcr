import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { WorkflowExecutor, WorkflowExecutionContext, ProgrammaticTransformerRegistry, ProgrammaticTransformFunction } from '../../../src/core/workflow/WorkflowExecutor';
import type { Workflow } from '../../../src/core/workflow/Workflow';
import { createArtifact, ArtifactType, NLTextArtifact, SirJsonArtifact, PrologKbArtifact } from '../../../src/core/workflow/Artifact';
import type { Action, LlmGenerateAction, ProgrammaticTransformAction } from '../../../src/core/workflow/Action';
import { ActionType } from '../../../src/core/workflow/Action';
import { NullLlmProvider } from '../../../src/providers/NullLlmProvider';
import type { IReasonProvider } from '../../../src/interfaces/IReasonProvider';
import type { ILlmProvider } from '../../../src/interfaces/ILlmProvider';
import { v4 as uuidv4 } from 'uuid';

describe('WorkflowExecutor', () => {
  let mockLlmProvider: ILlmProvider;
  let mockReasonProvider: IReasonProvider;
  let mockTransformers: ProgrammaticTransformerRegistry;
  let executionContext: WorkflowExecutionContext;
  let executor: WorkflowExecutor;

  beforeEach(() => {
    mockLlmProvider = new NullLlmProvider("Default mock LLM response");
    mockReasonProvider = {
      validate: jest.fn(async () => ({ valid: true })),
      query: jest.fn(async () => ({ success: true, bindings: [] })),
      getName: jest.fn(() => 'mockReasoner'),
    };
    mockTransformers = new Map();
    executionContext = {
      llmProvider: mockLlmProvider,
      reasonProvider: mockReasonProvider,
      programmaticTransformers: mockTransformers,
    };
    executor = new WorkflowExecutor(executionContext);
  });

  it('should execute a simple linear workflow with one LLMGenerateAction stage', async () => {
    const startArtifact = createArtifact(ArtifactType.NL_TEXT, { content: "Hello world" });
    const stageId = "llmStage1";
    const llmAction: LlmGenerateAction = {
      type: ActionType.LLM_GENERATE,
      parameters: {
        directUserPrompt: "Translate: {inputText}",
        outputArtifactType: ArtifactType.NL_TEXT, // Outputting NL_TEXT for simplicity
      }
    };
    const workflow: Workflow = {
      id: "testWorkflow1",
      name: "Simple LLM Workflow",
      startNodeId: stageId,
      nodes: {
        [stageId]: { id: stageId, name: "LLM Stage", action: llmAction }
      },
      expectedInputArtifacts: [{ name: "initialInput", type: ArtifactType.NL_TEXT }],
      expectedOutputArtifacts: [{ name: "finalOutput", type: ArtifactType.NL_TEXT, metadata: { sourceNodeOutput: `${stageId}.output`} }]
    };

    const mockResponse = "Translated: Hello world";
    (mockLlmProvider as NullLlmProvider).setResponseForPrompt("Translate: Hello world", mockResponse);

    const initialArtifacts = new Map();
    initialArtifacts.set("initialInput", startArtifact);

    const outputArtifacts = await executor.execute(workflow, initialArtifacts);

    expect(outputArtifacts.size).toBe(1);
    const finalOutput = outputArtifacts.get("finalOutput");
    expect(finalOutput).toBeDefined();
    expect(finalOutput?.type).toBe(ArtifactType.NL_TEXT);
    expect(finalOutput?.content).toBe(mockResponse);
    expect(finalOutput?.metadata?.sourceNode).toBe(stageId);
  });

  it('should execute a workflow with a ProgrammaticTransformAction stage', async () => {
    const startArtifact = createArtifact(ArtifactType.NL_TEXT, { content: "data" });
    const transformerName = "testTransformer";
    const transformedContent = "transformed:data";

    // Mock transformer function
    const mockTransformFn: ProgrammaticTransformFunction<NLTextArtifact[], NLTextArtifact> =
      jest.fn(async (inputs, params) => {
        const input = inputs.find(i => i.type === ArtifactType.NL_TEXT);
        return createArtifact(ArtifactType.NL_TEXT, { content: `transformed:${input?.content}` });
      });
    mockTransformers.set(transformerName, mockTransformFn);

    const stageId = "transformStage1";
    const transformAction: ProgrammaticTransformAction = {
      type: ActionType.PROGRAMMATIC_TRANSFORM,
      parameters: {
        transformerName: transformerName,
        outputArtifactType: ArtifactType.NL_TEXT,
      }
    };
    const workflow: Workflow = {
      id: "testWorkflow2",
      name: "Simple Transform Workflow",
      startNodeId: stageId,
      nodes: {
        [stageId]: { id: stageId, name: "Transform Stage", action: transformAction }
      },
      expectedInputArtifacts: [{ name: "initialData", type: ArtifactType.NL_TEXT }],
      expectedOutputArtifacts: [{ name: "transformedData", type: ArtifactType.NL_TEXT, metadata: { sourceNodeOutput: `${stageId}.output`} }]
    };

    const initialArtifacts = new Map();
    initialArtifacts.set("initialData", startArtifact);

    const outputArtifacts = await executor.execute(workflow, initialArtifacts);

    expect(mockTransformFn).toHaveBeenCalledTimes(1);
    expect(outputArtifacts.size).toBe(1);
    const finalOutput = outputArtifacts.get("transformedData");
    expect(finalOutput).toBeDefined();
    expect(finalOutput?.content).toBe(transformedContent);
    expect(finalOutput?.metadata?.sourceNode).toBe(stageId);
  });

  it('should follow edges in a multi-stage linear workflow', async () => {
    const nlInput = createArtifact(ArtifactType.NL_TEXT, { content: "Fact: A is B." });
    const stage1Id = "nlToSir";
    const stage2Id = "sirToProlog";

    // Stage 1: NL to SIR (LLM)
    const nlToSirAction: LlmGenerateAction = {
      type: ActionType.LLM_GENERATE,
      parameters: { directUserPrompt: "{inputText}", outputArtifactType: ArtifactType.SIR_JSON }
    };
    // Stage 2: SIR to Prolog (Programmatic)
    const sirToPrologAction: ProgrammaticTransformAction = {
      type: ActionType.PROGRAMMATIC_TRANSFORM,
      parameters: { transformerName: "mockSirToProlog", outputArtifactType: ArtifactType.PROLOG_KB }
    };

    const mockSirOutputContent = { intent: "FACTS", facts: [{ predicate: "b", arguments: ["a"] }] };
    (mockLlmProvider as NullLlmProvider).setResponseForPrompt("Fact: A is B.", JSON.stringify(mockSirOutputContent));

    const mockPrologOutputContent = "b(a).";
    const mockSirToPrologFn = jest.fn(async (inputs: SirJsonArtifact[], params) => {
      // Simplified: assume correct SIR input and convert
      // In a real test, you'd check the actual input artifact content
      return createArtifact(ArtifactType.PROLOG_KB, { content: mockPrologOutputContent });
    });
    mockTransformers.set("mockSirToProlog", mockSirToPrologFn);

    const workflow: Workflow = {
      id: "testWorkflow3",
      name: "Two Stage Linear Workflow",
      startNodeId: stage1Id,
      nodes: {
        [stage1Id]: { id: stage1Id, name: "NL to SIR", action: nlToSirAction },
        [stage2Id]: { id: stage2Id, name: "SIR to Prolog", action: sirToPrologAction }
      },
      edges: [{ id: uuidv4(), sourceNodeId: stage1Id, targetNodeId: stage2Id }],
      expectedInputArtifacts: [{ name: "nlInput", type: ArtifactType.NL_TEXT }],
      expectedOutputArtifacts: [{ name: "prologOutput", type: ArtifactType.PROLOG_KB, metadata: { sourceNodeOutput: `${stage2Id}.output`} }]
    };

    const initialArtifacts = new Map();
    initialArtifacts.set("nlInput", nlInput);

    const outputArtifacts = await executor.execute(workflow, initialArtifacts);

    expect(outputArtifacts.size).toBe(1);
    const finalOutput = outputArtifacts.get("prologOutput");
    expect(finalOutput).toBeDefined();
    expect(finalOutput?.type).toBe(ArtifactType.PROLOG_KB);
    expect(finalOutput?.content).toBe(mockPrologOutputContent);
    expect(mockSirToPrologFn).toHaveBeenCalledTimes(1);
    // Check that the input to sirToPrologFn was the output of nlToSirAction
    const sirToPrologInput = (mockSirToPrologFn.mock.calls[0][0] as Artifact[]).find(a => a.type === ArtifactType.SIR_JSON);
    expect(sirToPrologInput?.content).toEqual(mockSirOutputContent);
  });

  // TODO: Add tests for DecisionPoints and routing
  // TODO: Add tests for error handling (e.g., stage action throws error)
  // TODO: Add tests for input validation (missing inputs, type mismatches)
  // TODO: Add tests for more complex input resolution (when implemented)
});
