import pl from 'tau-prolog';

let session; // one Tau session per MCR session
import { registerNeural } from './neuralPred.js';
export function bootTau() {
	session = pl.create();
	// consult stdlib + custom neural lib (see 2.1)
	session.consult(`
    :- use_module(library(lists)).
  `);
	registerNeural(session);
	return session;
}
