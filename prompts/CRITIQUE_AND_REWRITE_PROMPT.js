module.exports = {
  name: 'CRITIQUE_AND_REWRITE_PROMPT',
  description:
    'Critiques an original prompt based on failure examples and rewrites it.',
  tags: ['evolution', 'meta', 'internal'],
  system: `You are an expert prompt engineer. Your task is to meticulously analyze an original prompt, understand its goal, identify its weaknesses based on provided failure examples, and then rewrite it for improved performance.
Focus on clarity, specificity, robustness, and adherence to output format requirements (if any were implied by the original prompt or its context) in the rewritten prompt. Ensure the new prompt still aims to achieve the original goal.`,
  user: `The original prompt is designed to achieve the following goal:
"{{prompt_goal}}"

Original Prompt Text:
"""
{{original_prompt}}
"""

This original prompt produced incorrect or suboptimal outputs on the following examples:
---
{{failure_examples}}
---

Your tasks:
1.  **Critique (Mental Step - do not output this part):** Briefly analyze why the original prompt might have failed for these examples. Consider issues like ambiguity, lack of context, insufficient constraints, misinterpretation of intent, or inadequate formatting instructions.
2.  **Rewrite:** Provide a new, improved prompt that directly addresses these failures and is more likely to succeed on similar cases.

IMPORTANT INSTRUCTIONS FOR YOUR OUTPUT:
- Your response MUST consist ONLY of the rewritten prompt text.
- Do NOT include any preamble, explanation, self-critique, or markdown formatting (like \`\`\`json or \`\`\` text wrappers) around the rewritten prompt.
- The rewritten prompt should be ready to be used directly in place of the original.
`,
  expectedFormat: 'text', // plain text output
  version: '1.0',
};
