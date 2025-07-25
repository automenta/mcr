import MCR from '../index.js';

let mcr;

async function getMCR() {
  if (!mcr) {
    mcr = await MCR.create();
  }
  return mcr;
}

export async function generateExample(domain, instructions) {
  const mcr = await getMCR();
  const prompt = `Generate a JSON object representing a test case for the domain "${domain}". The test case should follow these instructions: "${instructions}". The JSON object should have "input" and "expected_output" properties.`;
  const result = await mcr.engine.callLLM(prompt);
  return JSON.parse(result);
}

export async function generateOntology(domain, instructions) {
  const mcr = await getMCR();
  const prompt = `Generate a Prolog ontology for the domain "${domain}". The ontology should follow these instructions: "${instructions}".`;
  const result = await mcr.engine.callLLM(prompt);
  return result;
}
