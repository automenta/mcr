// aethelred/src/strategies/DirectS1Strategy.ts

import type { ITranslationStrategy } from '../interfaces/ITranslationStrategy.js';
// import { ILlmProvider } from '../interfaces'; // No longer used directly
// import { Clause, QueryString } from '../types'; // Old types

import type { Workflow, WorkflowNode, WorkflowEdge } from '../core/workflow/Workflow.js'; // Workflow is a type, others too but used as types
import type { Stage } from '../core/workflow/Stage.js';
import { ActionType } from '../core/workflow/Action.js'; // ActionType is an enum
import type { LlmGenerateAction, LlmGenerateParams } from '../core/workflow/Action.js'; // These are interfaces (types)
import { ArtifactType } from '../core/workflow/Artifact.js'; // ArtifactType is an enum
import type { Artifact, NLTextArtifact } from '../core/workflow/Artifact.js'; // Artifact, NLTextArtifact are types
// createNLTextArtifact is not used in this file
import { v4 as uuidv4 } from 'uuid';

export class DirectS1Strategy implements ITranslationStrategy {

  public getName(): string {
    return 'Direct-S1';
  }

  public defineAssertWorkflow(
    nlTextArtifact: NLTextArtifact,
    _context?: Map<string, Artifact> // Context not used in this simple strategy yet
  ): Workflow {
    const stageId = `s1_assert_stage_nl_to_prolog_${uuidv4().substring(0,8)}`;

    const llmActionParams: LlmGenerateParams = {
      // Ideally, we'd use a named prompt template registered elsewhere.
      // For Direct-S1, the prompt is simple enough to define inline or load.
      // Let's assume a direct user prompt construction for now.
      directUserPrompt: `Convert the following natural language text into one or more Prolog facts or rules.
Each fact should be on a separate line, ending with a period.
Facts should use lowercase predicates and proper Prolog syntax.

Natural language text: "${nlTextArtifact.content}"

Prolog facts/rules:`,
      outputArtifactType: ArtifactType.PROLOG_KB, // Expecting a block of Prolog clauses
      // options: { temperature: 0.3 } // Example LLM option
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
      edges: [], // Linear workflow with one stage
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
    _context?: Map<string, Artifact> // Context not used
  ): Workflow {
    const stageId = `s1_query_stage_nl_to_prolog_${uuidv4().substring(0,8)}`;

    const llmActionParams: LlmGenerateParams = {
      directUserPrompt: `Convert the following natural language question into a Prolog query.
The query should use proper Prolog syntax with variables starting with uppercase letters.
Do not include the ?- prefix, just the query ending with a period.

Natural language question: "${nlQuestionArtifact.content}"

Prolog query:`,
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
      edges: [], // Linear workflow with one stage
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
