// aethelred/src/strategies/DirectS1Strategy.ts

import type { ITranslationStrategy } from '../interfaces/ITranslationStrategy.js';
import type { Workflow } from '../core/workflow/Workflow.js';
import type { Stage } from '../core/workflow/Stage.js';
import { ActionType } from '../core/workflow/Action.js';
import type { LlmGenerateAction, LlmGenerateParams } from '../core/workflow/Action.js';
import { ArtifactType } from '../core/workflow/Artifact.js';
import type { Artifact, NLTextArtifact } from '../core/workflow/Artifact.js';
import { v4 as uuidv4 } from 'uuid';

export class DirectS1Strategy implements ITranslationStrategy {

  public getName(): string {
    return 'Direct-S1';
  }

  public defineAssertWorkflow(
    nlTextArtifact: NLTextArtifact,
    _context?: Map<string, Artifact>
  ): Workflow {
    const stageId = `s1_assert_stage_nl_to_prolog_${uuidv4().substring(0,8)}`;

    const llmActionParams: LlmGenerateParams = {
      directSystemPrompt: "You are an expert in translating natural language to Prolog. " +
                          "Convert the user's text into one or more concise Prolog facts or rules. " +
                          "Each fact or rule must end with a period. Output each on a new line. " +
                          "Use standard Prolog syntax. For example, 'John likes Mary' becomes 'likes(john, mary).'. " +
                          "'All birds fly' becomes 'flies(X) :- bird(X).'. " +
                          "If the input is a statement of fact, produce a fact. If it is a general rule, produce a rule.",
      directUserPrompt: `Translate the following text to Prolog clauses:\n\n"${nlTextArtifact.content}"`,
      outputArtifactType: ArtifactType.PROLOG_KB,
      // options: { temperature: 0.3 }
    };

    const llmAction: LlmGenerateAction = {
      type: ActionType.LLM_GENERATE,
      parameters: llmActionParams,
    };

    const translationStage: Stage = {
      id: stageId,
      name: 'NL to Prolog (Direct Assertion)',
      description: 'Directly translates natural language text to Prolog facts/rules using an LLM.',
      action: llmAction,
    };

    const workflow: Workflow = {
      id: `wf_direct_s1_assert_${uuidv4().substring(0,8)}`,
      name: 'Direct-S1 Assertion Workflow',
      description: 'A simple workflow to assert NL text directly as Prolog clauses.',
      startNodeId: stageId,
      nodes: {
        [stageId]: translationStage,
      },
      edges: [],
      expectedInputArtifacts: [
        { name: "naturalLanguageText", type: ArtifactType.NL_TEXT, description: "The NL text to assert." }
      ],
      expectedOutputArtifacts: [
        { name: "prologKnowledgeBase", type: ArtifactType.PROLOG_KB, description: "Prolog facts/rules." }
      ],
      metadata: {
        strategyName: this.getName(),
        powerLevel: "Fast"
      }
    };

    return workflow;
  }

  public defineQueryWorkflow(
    nlQuestionArtifact: NLTextArtifact,
    _context?: Map<string, Artifact>
  ): Workflow {
    const stageId = `s1_query_stage_nl_to_prolog_${uuidv4().substring(0,8)}`;

    const llmActionParams: LlmGenerateParams = {
      directSystemPrompt: "You are an expert in translating natural language questions into Prolog queries. " +
                          "Convert the user's question into a syntactically correct Prolog query. " +
                          "The query should end with a period. Variables should be uppercase. " +
                          "For example, 'Who likes Mary?' becomes 'likes(X, mary).'. " +
                          "'Does John like fish?' becomes 'likes(john, fish).'. " +
                          "Do not include the ?- prefix.",
      directUserPrompt: `Translate the following question to a Prolog query:\n\n"${nlQuestionArtifact.content}"`,
      outputArtifactType: ArtifactType.QUERY_STRING,
      // options: { temperature: 0.1 }
    };

    const llmAction: LlmGenerateAction = {
      type: ActionType.LLM_GENERATE,
      parameters: llmActionParams,
    };

    const translationStage: Stage = {
      id: stageId,
      name: 'NL to Prolog Query (Direct)',
      description: 'Directly translates an NL question to a Prolog query string using an LLM.',
      action: llmAction,
    };

    const workflow: Workflow = {
      id: `wf_direct_s1_query_${uuidv4().substring(0,8)}`,
      name: 'Direct-S1 Query Workflow',
      description: 'A simple workflow to translate an NL question directly to a Prolog query.',
      startNodeId: stageId,
      nodes: {
        [stageId]: translationStage,
      },
      edges: [],
      expectedInputArtifacts: [
        { name: "naturalLanguageQuestion", type: ArtifactType.NL_TEXT, description: "The NL question." }
      ],
      expectedOutputArtifacts: [
        { name: "prologQuery", type: ArtifactType.QUERY_STRING, description: "A Prolog query string." }
      ],
      metadata: {
        strategyName: this.getName(),
        powerLevel: "Fast"
      }
    };

    return workflow;
  }
}
