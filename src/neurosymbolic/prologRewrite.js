import { bootTau } from './tauBoot.js';

export function runRewrite(code, factsIn) {
  // factsIn: array of strings like "parent(a,b)."
  const tau = bootTau();
  factsIn.forEach(f => tau.consult(f));
  tau.query(code); // expect rewrite_rules(In,Out)
  const solutions = [];
  tau.answers(x => solutions.push(x.lookup('Out')));
  return solutions.map(s => s.toString());
}
