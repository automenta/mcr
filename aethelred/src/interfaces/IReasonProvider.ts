import { QueryString, QueryResult, ValidationResult } from '../types';

export interface IReasonProvider {
  /**
   * Executes a query against a knowledge base and returns the results
   */
  query(kb: string, query: QueryString): Promise<QueryResult>;
  
  /**
   * Checks a knowledge base for syntactic correctness
   */
  validate(kb: string): Promise<ValidationResult>;
  
  /**
   * Returns the name/type of this reasoner
   */
  getName(): string;
}