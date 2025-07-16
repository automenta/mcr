export function exportGoal(tau, goalStr) {
	tau.query(goalStr);
	const arr = [];
	tau.answers(ans => arr.push(ans.toJavaScript()));
	return arr;
}

export function importClauses(tau, clauses) {
	clauses.forEach(c => tau.consult(c));
}
