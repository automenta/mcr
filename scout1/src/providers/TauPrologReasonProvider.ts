import * as pl from 'tau-prolog';
import { IReasonProvider } from '../interfaces';
import { QueryString, QueryResult, ValidationResult } from '../types';

export class TauPrologReasonProvider implements IReasonProvider {
  
  async query(kb: string, query: QueryString): Promise<QueryResult> {
    try {
      // Create a new session
      const session = pl.create(1000);
      
      // Consult the knowledge base
      await new Promise<void>((resolve, reject) => {
        session.consult(kb, {
          success: () => resolve(),
          error: (err: any) => reject(new Error(`Failed to consult KB: ${err.toString()}`))
        });
      });
      
      // Execute the query
      const results = await new Promise<any[]>((resolve, reject) => {
        const answers: any[] = [];
        
        session.query(query, {
          success: (goal: any) => {
            session.answers(
              (answer: any) => {
                if (answer && answer.id === 'throw') {
                  reject(new Error(`Query error: ${answer.args[0].toString()}`));
                } else if (answer && answer.id === 'true') {
                  answers.push({});
                } else if (answer) {
                  const bindings: Record<string, any> = {};
                  for (const variable in answer.links) {
                    if (answer.links.hasOwnProperty(variable)) {
                      bindings[variable] = answer.links[variable].toString();
                    }
                  }
                  answers.push(bindings);
                } else {
                  resolve(answers);
                }
              }
            );
          },
          error: (err: any) => reject(new Error(`Query failed: ${err.toString()}`))
        });
      });
      
      return {
        success: true,
        bindings: results.length > 0 ? results : undefined
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  async validate(kb: string): Promise<ValidationResult> {
    try {
      const session = pl.create(1000);
      
      await new Promise<void>((resolve, reject) => {
        session.consult(kb, {
          success: () => resolve(),
          error: (err: any) => reject(new Error(err.toString()))
        });
      });
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
    }
  }
  
  getName(): string {
    return 'tau-prolog';
  }
}