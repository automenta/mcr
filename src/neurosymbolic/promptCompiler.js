import crypto from 'crypto';

// convert prompt fragment → Prolog fact
export function compilePrompt(text, label) {
	const id = crypto.randomUUID();
	return `prompt_fragment(${id}, ${label}, "${text.replace(/"/g, '\\"')}").`;
}

// inverse: clause → prompt string
export function clauseToPrompt(clauseStr) {
	// naive but deterministic
	return clauseStr.replace(/_/g, ' ');
}
