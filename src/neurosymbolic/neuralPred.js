import llmService from '../llmService.js';
import pl from 'tau-prolog';

export function registerNeural(tau) {
	tau.add_predicate('neural/3', (goal, _args, _next) => {
		const [providerT, promptList, resultVar] = goal.args;
		const prompt = promptList.toJavaScript().join('');
		llmService.generate(prompt).then(text => {
			const atom = pl.format_answer(pl.parse(text.trim()));
			resultVar.unify(atom);
			goal.retry();
		});
		return false; // async wait
	});
}
