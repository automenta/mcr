import * as pl from 'tau-prolog';
import { v4 as uuidv4 } from 'uuid';

class Session {
  constructor(initialKb = '') {
    this.id = uuidv4();
    this.prolog = pl.create();
    this.kb = initialKb;
    this.lexicon = '';

    if (initialKb) {
      this.prolog.consult(initialKb);
    }
  }

  async consult(prologClause) {
    await this.prolog.consult(prologClause);
    this.kb += `\n${prologClause}`;
  }

  async query(prologQuery) {
    return new Promise((resolve, reject) => {
      const results = [];
      this.prolog.query(prologQuery, {
        success: () => {
          this.prolog.answers(x => {
            if (x) {
              results.push(this.prolog.format_answer(x));
            } else {
              resolve(results);
            }
          });
        },
        error: (err) => reject(err),
      });
    });
  }

  async retract(prologPattern) {
    const initialKb = this.kb;
    const newKb = initialKb.replace(new RegExp(`^${prologPattern}.*\\.$`, 'm'), '');

    if (initialKb.length === newKb.length) {
      return 0;
    }

    this.kb = newKb;
    this.prolog = pl.create();
    await this.prolog.consult(this.kb);

    return 1;
  }
}

export default Session;
