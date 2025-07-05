import { ITranslationStrategy, ILlmProvider } from '../interfaces';
import { Clause, QueryString, SIRSchema } from '../types';

export class SIRR1Strategy implements ITranslationStrategy {
  
  getName(): string {
    return 'SIR-R1';
  }
  
  async assert(text: string, llmProvider: ILlmProvider): Promise<Clause[]> {
    // Step 1: Intent Classification
    const intentPrompt = `Classify the following text as either asserting FACTS or defining a RULE.
    
Text: "${text}"

Respond with only "FACTS" or "RULE".`;

    const intentResponse = await llmProvider.generate(intentPrompt);
    const intent = intentResponse.trim().toUpperCase();
    
    // Step 2: SIR Generation
    let sirPrompt: string;
    
    if (intent === 'FACTS') {
      sirPrompt = `Convert the following text into a structured JSON representation of Prolog facts.

Text: "${text}"

Return a JSON object with this exact structure:
{
  "intent": "FACTS",
  "facts": [
    {
      "predicate": "predicate_name",
      "arguments": ["arg1", "arg2", ...]
    }
  ]
}

Example:
Text: "John is a student. Mary likes pizza."
Output:
{
  "intent": "FACTS",
  "facts": [
    {"predicate": "student", "arguments": ["john"]},
    {"predicate": "likes", "arguments": ["mary", "pizza"]}
  ]
}

Only return the JSON, no other text:`;
    } else {
      sirPrompt = `Convert the following text into a structured JSON representation of a Prolog rule.

Text: "${text}"

Return a JSON object with this exact structure:
{
  "intent": "RULE",
  "rule": {
    "head": {
      "predicate": "predicate_name",
      "arguments": ["arg1", "arg2", ...]
    },
    "body": [
      {
        "predicate": "predicate_name",
        "arguments": ["arg1", "arg2", ...],
        "negated": false
      }
    ]
  }
}

Example:
Text: "Someone is smart if they are a student and they study hard."
Output:
{
  "intent": "RULE",
  "rule": {
    "head": {"predicate": "smart", "arguments": ["X"]},
    "body": [
      {"predicate": "student", "arguments": ["X"], "negated": false},
      {"predicate": "studies_hard", "arguments": ["X"], "negated": false}
    ]
  }
}

Only return the JSON, no other text:`;
    }
    
    const sirResponse = await llmProvider.generate(sirPrompt);
    
    // Step 3: SIR Validation
    let sir: SIRSchema;
    try {
      sir = JSON.parse(sirResponse.trim());
    } catch (error) {
      throw new Error(`Failed to parse SIR JSON: ${error}`);
    }
    
    // Step 4: Syntactic Translation
    const clauses: Clause[] = [];
    
    if (sir.intent === 'FACTS' && sir.facts) {
      for (const fact of sir.facts) {
        const args = fact.arguments.join(', ');
        clauses.push(`${fact.predicate}(${args}).`);
      }
    } else if (sir.intent === 'RULE' && sir.rule) {
      const headArgs = sir.rule.head.arguments.join(', ');
      const head = `${sir.rule.head.predicate}(${headArgs})`;
      
      const bodyParts = sir.rule.body.map(bodyPart => {
        const args = bodyPart.arguments.join(', ');
        const predicate = `${bodyPart.predicate}(${args})`;
        return bodyPart.negated ? `\\+ ${predicate}` : predicate;
      });
      
      const body = bodyParts.join(', ');
      clauses.push(`${head} :- ${body}.`);
    }
    
    return clauses;
  }
  
  async query(text: string, llmProvider: ILlmProvider): Promise<QueryString> {
    const prompt = `Convert the following natural language question into a Prolog query.
Use proper Prolog syntax with variables starting with uppercase letters (X, Y, Person, etc.).
Use lowercase for predicates and constants.
Do not include the ?- prefix.

Natural language question: "${text}"

Examples:
Question: "Who is a student?"
Query: student(X).

Question: "What does Mary like?"
Query: likes(mary, X).

Question: "Is John a student?"
Query: student(john).

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