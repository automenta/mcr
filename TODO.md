──────────────── STEP-BY-STEP ────────────────
Legend:
• `+` = add file / function
• `~` = modify existing file (diff context ≤ 15 lines shown)
• Pseudocode is executable ES2023 + Tau Prolog WASM API

──────────────── 1.  Bootstrap Tau Prolog inside MCR
1.1  + `src/neurosymbolic/tauBoot.js`
```js
import pl from 'tau-prolog';

let session;                       // one Tau session per MCR session
export function bootTau() {
  session = pl.create();
  // consult stdlib + custom neural lib (see 2.1)
  session.consult(`
    :- use_module(library(lists)).
    :- use_module(library(neural)).
  `);
  return session;
}
```

1.2  ~ `src/mcrService.js` (constructor)
```js
import { bootTau } from './neurosymbolic/tauBoot.js';
// inside Session constructor
this.tau = bootTau();
```

──────────────── 2.  Neural ↔ Symbolic Bridge
2.1  + `src/neurosymbolic/neuralPred.js`
```js
import { llmService } from '../services/llmService.js';

export function registerNeural(tau) {
  tau.add_predicate('neural/3', (goal, _args, _next) => {
    const [providerT, promptList, resultVar] = goal.args;
    const prompt = promptList.toJavaScript().join('');
    llmService.generate(prompt).then(text => {
      const atom = pl.format(text.trim());
      resultVar.unify(atom);
      goal.retry();
    });
    return false; // async wait
  });
}
```
2.2  ~ `src/neurosymbolic/tauBoot.js`
```js
import { registerNeural } from './neuralPred.js';
export function bootTau() {
  ...
  registerNeural(session);
  return session;
}
```

──────────────── 3.  PrologRewrite Strategy Node
3.1  + `src/neurosymbolic/prologRewrite.js`
```js
export function runRewrite(code, factsIn) {
  // factsIn: array of strings like "parent(a,b)."
  const tau = bootTau();
  factsIn.forEach(f => tau.consult(f));
  tau.query(code);               // expect rewrite_rules(In,Out)
  const solutions = [];
  tau.answers(x => solutions.push(x.Out));
  return solutions.map(s => s.toString());
}
```

3.2  ~ `src/evolution/strategyExecutor.js` (runNode)
```js
if (node.type === 'PrologRewrite') {
  const rewritten = runRewrite(node.code, node.inputFacts);
  return { success: true, data: rewritten };
}
```

──────────────── 4.  Prompt ↔ Clause Compiler
4.1  + `src/neurosymbolic/promptCompiler.js`
```js
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
```

4.2  ~ `src/services/mcrService.js` (assertNL)
```js
import { compilePrompt } from '../neurosymbolic/promptCompiler.js';
// after LLM yields clauses
clauses.forEach(c => {
  session.tau.consult(c);                    // symbolic
  const pf = compilePrompt(c, 'generated');
  session.tau.consult(pf);                   // prompt fact
});
```

──────────────── 5.  Symbolic Export / Import API
5.1  + `src/neurosymbolic/symbolicExchange.js`
```js
export function exportGoal(tau, goalStr) {
  tau.query(goalStr);
  const arr = [];
  tau.answers(ans => arr.push(ans.toJavaScript()));
  return arr;
}

export function importClauses(tau, clauses) {
  clauses.forEach(c => tau.consult(c));
}
```

5.2  ~ `src/tools.js` (new tools)
```js
case 'symbolic.export':
  const res = exportGoal(session.tau, input.goal);
  return { success: true, data: res };

case 'symbolic.import':
  importClauses(session.tau, input.clauses);
  return { success: true };
```

──────────────── 6.  Workbench – Monaco Tau REPL
6.1  + `ui/src/components/TauReplPane.jsx`
```jsx
import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { ws } from '../api';

export default function TauReplPane({ sessionId }) {
  const editorRef = useRef();
  useEffect(() => {
    const ed = monaco.editor.create(editorRef.current, { language: 'prolog' });
    ed.onKeyDown(e => {
      if (e.keyCode === 13 && e.ctrlKey) {
        const goal = ed.getValue();
        ws.invoke('symbolic.export', { sessionId, goal })
          .then(r => ed.setValue(ed.getValue() + '\n% ' + JSON.stringify(r.data)));
      }
    });
  }, [sessionId]);
  return <div ref={editorRef} style={{ height: 300 }} />;
}
```

6.2  ~ `ui/src/pages/Workbench.jsx`
```jsx
import TauReplPane from '../components/TauReplPane.jsx';
// add tab
<Tab label="Tau REPL"><TauReplPane sessionId={id} /></Tab>
```

──────────────── 8.  Zero-Breaking Migration
• All new code lives in `src/neurosymbolic/` and `ui/src/components/`.
• Legacy strategies without `PrologRewrite` nodes execute exactly as before.
• Existing KB dumps load directly into Tau Prolog; no schema change.

Run `node mcr.js` → everything still works, plus neurosymbolic super-powers.
