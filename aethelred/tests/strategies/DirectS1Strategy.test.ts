import { describe, it, expect, beforeEach } from '@jest/globals';
import { DirectS1Strategy } from '../../../src/strategies/DirectS1Strategy';
import { createNLTextArtifact, ArtifactType } from '../../../src/core/workflow/Artifact';
import type { Workflow } from '../../../src/core/workflow/Workflow';
import { ActionType, LlmGenerateAction } from '../../../src/core/workflow/Action';

describe('DirectS1Strategy', () => {
  let strategy: DirectS1Strategy;

  beforeEach(() => {
    strategy = new DirectS1Strategy();
  });

  it('getName() should return "Direct-S1"', () => {
    expect(strategy.getName()).toBe('Direct-S1'); // Matches the implementation
  });

  describe('defineAssertWorkflow', () => {
    it('should define a valid assert workflow', () => {
      const nlText = "Socrates is a man.";
      const nlArtifact = createNLTextArtifact({ content: nlText });
      const workflow: Workflow = strategy.defineAssertWorkflow(nlArtifact);

      expect(workflow).toBeDefined();
      expect(workflow.id).toStartWith('wf_ds1_assert_');
      expect(workflow.name).toBe('DirectS1 Assert Workflow');
      expect(workflow.startNodeId).toBeString();

      expect(Object.keys(workflow.nodes).length).toBe(1);
      const startNode = workflow.nodes[workflow.startNodeId];
      expect(startNode).toBeDefined();
      expect(startNode.name).toBe('NL to Prolog (Direct Assertion)');
      expect(startNode.action.type).toBe(ActionType.LLM_GENERATE);

      const llmAction = startNode.action as LlmGenerateAction;
      expect(llmAction.parameters.outputArtifactType).toBe(ArtifactType.PROLOG_KB);
      expect(llmAction.parameters.directSystemPrompt).toBeString();
      expect(llmAction.parameters.directUserPrompt).toContain(nlText);

      expect(workflow.expectedInputArtifacts).toEqual([
        { name: "naturalLanguageText", type: ArtifactType.NL_TEXT, description: "The NL text to assert." }
      ]);
      expect(workflow.expectedOutputArtifacts).toEqual([
        { name: "prologKnowledgeBase", type: ArtifactType.PROLOG_KB, description: "Prolog facts/rules." }
      ]);
    });
  });

  describe('defineQueryWorkflow', () => {
    it('should define a valid query workflow', () => {
      const nlQuestion = "Is Socrates mortal?";
      const nlArtifact = createNLTextArtifact({ content: nlQuestion });
      const workflow: Workflow = strategy.defineQueryWorkflow(nlArtifact);

      expect(workflow).toBeDefined();
      expect(workflow.id).toStartWith('wf_ds1_query_');
      expect(workflow.name).toBe('DirectS1 Query Workflow');
      expect(workflow.startNodeId).toBeString();

      expect(Object.keys(workflow.nodes).length).toBe(1);
      const startNode = workflow.nodes[workflow.startNodeId];
      expect(startNode).toBeDefined();
      expect(startNode.name).toBe('NL to Prolog Query (Direct)');
      expect(startNode.action.type).toBe(ActionType.LLM_GENERATE);

      const llmAction = startNode.action as LlmGenerateAction;
      expect(llmAction.parameters.outputArtifactType).toBe(ArtifactType.QUERY_STRING);
      expect(llmAction.parameters.directSystemPrompt).toBeString();
      expect(llmAction.parameters.directUserPrompt).toContain(nlQuestion);

      expect(workflow.expectedInputArtifacts).toEqual([
        { name: "naturalLanguageQuestion", type: ArtifactType.NL_TEXT, description: "The NL question." }
      ]);
      expect(workflow.expectedOutputArtifacts).toEqual([
        { name: "prologQuery", type: ArtifactType.QUERY_STRING, description: "A Prolog query string." }
      ]);
    });
  });
});
