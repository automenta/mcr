import * as pl from 'tau-prolog';
import type { IReasonProvider } from '../interfaces/IReasonProvider';
import type { QueryString, QueryResult, ValidationResult } from '../types';

// Helper to promisify session.consult
function consultPromise(session: pl.type.Session, program: string): Promise<void> {
  return new Promise((resolve, reject) => {
    session.consult(program, {
      success: () => resolve(),
      error: (err: any) => reject(pl.format_error(err)),
    });
  });
}

// Helper to promisify session.query and session.answers
function queryPromise(session: pl.type.Session, query: string): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    session.query(query, {
      success: () => {
        const answers: Record<string, any>[] = [];
        let querySucceeded = false;

        function processAnswer(answer: pl.type.Answer | null) {
          if (answer === null) { // No more answers
            if (querySucceeded) {
              resolve({ success: true, bindings: answers.length > 0 ? answers : undefined });
            } else {
              // This case means the query itself was valid but yielded 'false' (no solutions)
              resolve({ success: true, bindings: undefined });
            }
            return;
          }

          if (answer.id === 'throw') { // Error during query execution
            reject(pl.format_error(answer));
            return;
          }

          querySucceeded = true; // Mark that at least one answer (even if just 'yes') was found

          // For queries like `fact.`, if they are true, Tau Prolog might give an answer
          // that isn't pl.type.ANSWER_YES but a substitution that is effectively empty.
          // We only collect bindings if there are variables.
          const currentBindings: Record<string, string> = {};
          let hasBindings = false;
          if (answer.links) {
            for (const variable in answer.links) {
              // Exclude variables starting with '_' (anonymous variables)
              if (Object.prototype.hasOwnProperty.call(answer.links, variable) && !variable.startsWith('_')) {
                currentBindings[variable] = session.format_answer(answer.links[variable], { session: session });
                hasBindings = true;
              }
            }
          }

          if (hasBindings) {
            answers.push(currentBindings);
          } else if (Object.keys(answer.links).length === 0 && answer.id !== 'false') {
            // This handles cases like a query `some_fact.` that is true,
            // where answer.links is {} but it's not a 'false' result.
            // We represent this as a success with an empty binding object if no specific bindings.
            // If answers is currently empty, add one to show it succeeded.
            if (answers.length === 0) {
                 answers.push({}); // Indicate success for a fact-checking query
            }
          }


          // Request next answer
          session.answer({
            success: processAnswer,
            error: (err: any) => reject(pl.format_error(err)),
            fail: () => { // This 'fail' means the query itself is unsatisfiable (yields 'false')
              resolve({ success: true, bindings: undefined });
            },
            limit: () => { // Query limit reached
              resolve({ success: true, bindings: answers, error: "Query limit reached" });
            }
          });
        }

        // Start processing answers
        session.answer({
          success: processAnswer,
          error: (err: any) => reject(pl.format_error(err)),
          fail: () => { // This 'fail' means the query itself is unsatisfiable (yields 'false')
             resolve({ success: true, bindings: undefined });
          },
          limit: () => { // Query limit reached
            resolve({ success: true, bindings: answers, error: "Query limit reached" });
          }
        });
      },
      error: (err: any) => reject(pl.format_error(err)), // Error in parsing/setting up the query
    });
  });
}


export class TauPrologReasonProvider implements IReasonProvider {
  private sessionOptions: pl.type.SessionOptions;

  constructor(options?: { maxLimits?: number }) {
    this.sessionOptions = {
      limit: options?.maxLimits || 1000, // Default execution steps limit
    };
  }
  
  async query(kb: string, query: QueryString): Promise<QueryResult> {
    const session = pl.create(this.sessionOptions.limit);
    try {
      if (kb.trim() !== '') {
        await consultPromise(session, kb);
      }
      return await queryPromise(session, query);
    } catch (error: any) {
      return {
        success: false,
        error: typeof error === 'string' ? error : (error.message || 'Unknown Prolog query error'),
      };
    }
  }
  
  async validate(kb: string): Promise<ValidationResult> {
    const session = pl.create(this.sessionOptions.limit);
    try {
      if (kb.trim() === '') { // Empty KB is valid
        return { valid: true };
      }
      await consultPromise(session, kb);
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: typeof error === 'string' ? error : (error.message || 'Unknown Prolog validation error'),
      };
    }
  }
  
  getName(): string {
    return 'tau-prolog';
  }
}
