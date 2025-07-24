import { getLLMProvider } from './llmProviders.js';

export async function generateEvalCases(domain, num, llmConfig) {
  const llmProvider = getLLMProvider(llmConfig);
  const prompt = `Generate ${num} evaluation cases for a neurosymbolic AI system in the domain of "${domain}". Each case should include a natural language query and the expected Prolog query.`;

  const response = await llmProvider.generate(prompt);
  // This is a simplified implementation. A more robust version would parse the response into a structured format.
  return response;
}

export async function generateOntology(domain, instructions, llmConfig) {
  const llmProvider = getLLMProvider(llmConfig);
  const prompt = `Generate a Prolog ontology for the domain of "${domain}". The ontology should follow these instructions:\n\n${instructions}`;

  const response = await llmProvider.generate(prompt);
  return response;
}
