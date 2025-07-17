module.exports = {
	system:
		'You are a helpful assistant that refines a generated output to be consistent with a validation error and similar context.',
	user: `
The original input was: "{{original_input}}"
The generated output failed validation:
---
{{failed_output}}
---
Validation Error: {{validation_error}}
Iteration: {{iteration}}

Here is some similar context from the knowledge base:
{{similar_context}}

Please provide a refined version of the output that addresses the validation error.
`,
};
