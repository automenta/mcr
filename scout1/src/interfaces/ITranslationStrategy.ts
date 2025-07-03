import { ILlmProvider } from './ILlmProvider';
import { Clause, QueryString } from '../types';

export interface ITranslationStrategy {
  /**
   * Returns the unique name of the strategy (e.g., "SIR-R1")
   */
  getName(): string;
  
  /**
   * Takes natural language text and returns a list of one or more symbolic clauses
   */
  assert(text: string, llmProvider: ILlmProvider): Promise<Clause[]>;
  
  /**
   * Takes a natural language question and returns a single, well-formed query string
   */
  query(text: string, llmProvider: ILlmProvider): Promise<QueryString>;
}