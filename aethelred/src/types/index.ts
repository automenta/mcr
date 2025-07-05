export type Clause = string;
export type QueryString = string;

export interface QueryResult {
  success: boolean;
  bindings?: Record<string, any>[];
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

// Removed Session interface from here, as it's now defined in core/knowledge/Session.ts

export interface SIRSchema {
  intent: 'FACTS' | 'RULE';
  facts?: Array<{
    predicate: string;
    arguments: string[];
  }>;
  rule?: {
    head: {
      predicate: string;
      arguments: string[];
    };
    body: Array<{
      predicate: string;
      arguments: string[];
      negated?: boolean;
    }>;
  };
}

export interface MCRConfig {
  activeStrategy: string;
  llmProvider: 'null' | 'ollama' | 'gemini';
  ollamaConfig?: {
    baseUrl: string;
    model: string;
  };
  geminiConfig?: {
    apiKey: string;
    model: string;
  };
}