import { describe, it, expect, beforeEach } from '@jest/globals';
import { SIRR1Strategy, SIR_VALIDATOR_TRANSFORMER, SIR_TO_PROLOG_TRANSFORMER } from '../../../src/strategies/SIRR1Strategy';
import { createNLTextArtifact, ArtifactType } from '../../../src/core/workflow/Artifact';
import type { Workflow } from '../../../src/core/workflow/Workflow';
import { ActionType, LlmGenerateAction, ProgrammaticTransformAction } from '../../../src/core/workflow/Action';

describe('SIRR1Strategy', () => {
  let strategy: SIRR1Strategy;

  beforeEach(() => {
    strategy = new SIRR1Strategy();
  });

  it('getName() should return "SIR-R1"', () => {
    expect(strategy.getName()).toBe('SIR-R1');
  });

  describe('defineAssertWorkflow', () => {
    it('should define a valid assert workflow with three stages and correct actions', () => {
      const nlText = "John likes apples. If someone likes apples, they eat apples.";
      const nlArtifact = createNLTextArtifact({ content: nlText });
      const workflow: Workflow = strategy.defineAssertWorkflow(nlArtifact);

      expect(workflow).toBeDefined();
      expect(workflow.id).toStartWith('wf_sirr1_assert_');
      expect(workflow.name).toBe('SIR-R1 Assert Workflow');
      expect(workflow.startNodeId).toBeString();

      expect(Object.keys(workflow.nodes).length).toBe(3);
      expect(workflow.edges?.length).toBe(2);

      // Stage 1: NL to SIR
      const nlToSirStage = workflow.nodes[workflow.startNodeId];
      expect(nlToSirStage).toBeDefined();
      expect(nlToSirStage.name).toBe('NL to SIR');
      expect(nlToSirStage.action.type).toBe(ActionType.LLM_GENERATE);
      const nlToSirAction = nlToSirStage.action as LlmGenerateAction;
      expect(nlToSirAction.parameters.outputArtifactType).toBe(ArtifactType.SIR_JSON);
      expect(nlToSirAction.parameters.directSystemPrompt).toBeString();
      expect(nlToSirAction.parameters.directUserPrompt).toContain(nlText);
      expect(nlToSirAction.parameters.options?.format).toBe('json');

      // Find next stage IDs from edges
      const edge1 = workflow.edges?.find(e => e.sourceNodeId === workflow.startNodeId);
      expect(edge1).toBeDefined();
      const validateSirStageId = edge1!.targetNodeId;

      // Stage 2: Validate SIR
      const validateSirStage = workflow.nodes[validateSirStageId];
      expect(validateSirStage).toBeDefined();
      expect(validateSirStage.name).toBe('Validate SIR');
      expect(validateSirStage.action.type).toBe(ActionType.PROGRAMMATIC_TRANSFORM);
      const validateSirAction = validateSirStage.action as ProgrammaticTransformAction;
      expect(validateSirAction.parameters.transformerName).toBe(SIR_VALIDATOR_TRANSFORMER);
      expect(validateSirAction.parameters.outputArtifactType).toBe(ArtifactType.SIR_JSON);

      const edge2 = workflow.edges?.find(e => e.sourceNodeId === validateSirStageId);
      expect(edge2).toBeDefined();
      const sirToPrologStageId = edge2!.targetNodeId;

      // Stage 3: SIR to Prolog
      const sirToPrologStage = workflow.nodes[sirToPrologStageId];
      expect(sirToPrologStage).toBeDefined();
      expect(sirToPrologStage.name).toBe('SIR to Prolog');
      expect(sirToPrologStage.action.type).toBe(ActionType.PROGRAMMATIC_TRANSFORM);
      const sirToPrologAction = sirToPrologStage.action as ProgrammaticTransformAction;
      expect(sirToPrologAction.parameters.transformerName).toBe(SIR_TO_PROLOG_TRANSFORMER);
      expect(sirToPrologAction.parameters.outputArtifactType).toBe(ArtifactType.PROLOG_KB);

      // Check expected inputs/outputs
      expect(workflow.expectedInputArtifacts).toEqual([
        { name: "userNaturalLanguageText", type: ArtifactType.NL_TEXT, description: "The NL text to assert." }
      ]);
      expect(workflow.expectedOutputArtifacts).toEqual([
        { name: "prologKnowledgeBase", type: ArtifactType.PROLOG_KB, description: "Prolog clauses generated from the NL text via SIR.", metadata: { sourceNodeOutput: `${sirToPrologStageId}.output` } }
      ]);
    });
  });

  describe('defineQueryWorkflow', () => {
    it('should define a valid query workflow (direct fallback)', () => {
      const nlQuestion = "Who likes apples?";
      const nlArtifact = createNLTextArtifact({ content: nlQuestion });
      const workflow: Workflow = strategy.defineQueryWorkflow(nlArtifact);

      expect(workflow).toBeDefined();
      expect(workflow.id).toStartWith('wf_sirr1_query_');
      expect(workflow.name).toBe('SIR-R1 Query Workflow (Direct Fallback)');
      expect(workflow.startNodeId).toBeString();

      expect(Object.keys(workflow.nodes).length).toBe(1);
      const startNode = workflow.nodes[workflow.startNodeId];
      expect(startNode).toBeDefined();
      expect(startNode.name).toBe('NL to Prolog Query (SIR-R1 Fallback)');
      expect(startNode.action.type).toBe(ActionType.LLM_GENERATE);

      const llmAction = startNode.action as LlmGenerateAction;
      expect(llmAction.parameters.outputArtifactType).toBe(ArtifactType.QUERY_STRING);
      expect(llmAction.parameters.directSystemPrompt).toBeString();
      expect(llmAction.parameters.directUserPrompt).toContain(nlQuestion);

      expect(workflow.expectedInputArtifacts).toEqual([
        { name: "userNaturalLanguageQuestion", type: ArtifactType.NL_TEXT, description: "The NL question." }
      ]);
      expect(workflow.expectedOutputArtifacts).toEqual([
        { name: "prologQueryString", type: ArtifactType.QUERY_STRING, description: "Prolog query string.", metadata: { sourceNodeOutput: `${startNode.id}.output` } }
      ]);
    });
  });
});
