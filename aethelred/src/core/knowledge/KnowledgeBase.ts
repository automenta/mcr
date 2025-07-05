import type { Clause, ValidationResult } from '../../types';
import type { IReasonProvider } from '../../interfaces/IReasonProvider';

/**
 * Interface for a Knowledge Base.
 * A Knowledge Base stores logical clauses and can be validated.
 */
export interface IKnowledgeBase {
  /**
   * Adds a clause to the knowledge base.
   * @param clause The clause to add.
   * @returns Promise that resolves when the clause is added.
   */
  addClause(clause: Clause): Promise<void>;

  /**
   * Adds multiple clauses to the knowledge base.
   * @param clauses An array of clauses to add.
   * @returns Promise that resolves when all clauses are added.
   */
  addClauses(clauses: Clause[]): Promise<void>;

  /**
   * Retrieves all clauses in the knowledge base as a single string.
   * Each clause should be followed by a period and a newline.
   * @returns Promise that resolves with the knowledge base string.
   */
  getKbString(): Promise<string>;

  /**
   * Validates the entire knowledge base using a given reasoner.
   * @param reasoner The reasoner provider to use for validation.
   * @returns Promise that resolves with the validation result.
   */
  validate(reasoner: IReasonProvider): Promise<ValidationResult>;

  /**
   * Clears all clauses from the knowledge base.
   * @returns Promise that resolves when the knowledge base is cleared.
   */
  clear(): Promise<void>;

  /**
   * Gets the current number of clauses in the knowledge base.
   * @returns Promise that resolves with the number of clauses.
   */
  getClauseCount(): Promise<number>;
}

/**
 * A Prolog-oriented implementation of IKnowledgeBase.
 * Stores clauses as an array of strings.
 */
export class PrologKnowledgeBase implements IKnowledgeBase {
  private clauses: Clause[];

  constructor(initialClauses?: Clause[]) {
    this.clauses = initialClauses || [];
  }

  async addClause(clause: Clause): Promise<void> {
    // Ensure clause ends with a period.
    const trimmedClause = clause.trim();
    if (trimmedClause) {
      this.clauses.push(trimmedClause.endsWith('.') ? trimmedClause : `${trimmedClause}.`);
    }
  }

  async addClauses(clauses: Clause[]): Promise<void> {
    for (const clause of clauses) {
      await this.addClause(clause);
    }
  }

  async getKbString(): Promise<string> {
    return this.clauses.join('\n') + (this.clauses.length > 0 ? '\n' : '');
  }

  async validate(reasoner: IReasonProvider): Promise<ValidationResult> {
    const kbString = await this.getKbString();
    return reasoner.validate(kbString);
  }

  async clear(): Promise<void> {
    this.clauses = [];
  }

  async getClauseCount(): Promise<number> {
    return this.clauses.length;
  }
}
