import MCREngine from '../mcrEngine.js';
import pl from 'tau-prolog';

const engine = new MCREngine();

export function registerNeural(tau) {
	tau.add_predicate('neural/3', (goal, _args, _next) => {
		const [providerT, promptList, resultVar] = goal.args;
		const prompt = promptList.toJavaScript().join('');
		engine.callLLM(prompt).then(text => {
			const atom = pl.format_answer(pl.parse(text.trim()));
			resultVar.unify(atom);
			goal.retry();
		});
		return false; // async wait
	});
}
