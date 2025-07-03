import { ITranslationStrategy, ILlmProvider } from '../interfaces';
import { Clause, QueryString } from '../types';

export class DirectS1Strategy implements ITranslationStrategy {
  
  getName(): string {
    return 'Direct-S1';
  }
  
  async assert(text: string, llmProvider: ILlmProvider): Promise<Clause[]> {
    const prompt = `Convert the following natural language text into one or more Prolog facts or rules.
Each fact should be on a separate line, ending with a period.
Facts should use lowercase predicates and proper Prolog syntax.

Natural language text: "${text}"

Prolog facts/rules:`;

    const response = await llmProvider.generate(prompt);
    
    // Simple regex-based post-processing to split into clauses
    const clauses = response
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('%'))
      .map(line => {
        // Ensure each clause ends with a period
        if (!line.endsWith('.')) {
          line += '.';
        }
        return line;
      })
      .filter(line => line.length > 1);
    
    return clauses;
  }
  
  async query(text: string, llmProvider: ILlmProvider): Promise<QueryString> {
    const prompt = `Convert the following natural language question into a Prolog query.
The query should use proper Prolog syntax with variables starting with uppercase letters.
Do not include the ?- prefix, just the query ending with a period.

Natural language question: "${text}"

Prolog query:`;

    const response = await llmProvider.generate(prompt);
    
    // Clean up the response
    let query = response.trim();
    
    // Remove any ?- prefix if present
    if (query.startsWith('?-')) {
      query = query.substring(2).trim();
    }
    
    // Ensure query ends with a period
    if (!query.endsWith('.')) {
      query += '.';
    }
    
    return query;
  }
}