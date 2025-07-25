async function translateToLogic(input, sessionId, mcr) {
  const upperLevelPrompt = `
    Analyze the following natural language input and model it as a structured JSON object.
    The JSON object should have the following properties:
    - "p": A summary of the user's primary intent (e.g., "querying relation", "asserting fact").
    - "t": The specific topic or domain (e.g., "family relationships", "geography").
    - "V": An array of key variables or entities identified.
    - "C": An array of constraints or conditions mentioned.
    - "O": The desired output format or question to be answered.

    Input: "${input}"
    JSON Model:
  `;

  const jsonModelString = await mcr.engine.callLLM(upperLevelPrompt);
  const jsonModel = JSON.parse(jsonModelString);

  const lowerLevelPrompt = `
    Given the following JSON model, generate the corresponding Prolog clauses.

    JSON Model:
    ${JSON.stringify(jsonModel, null, 2)}

    Prolog Clauses:
  `;

  const prologClauses = await mcr.engine.callLLM(lowerLevelPrompt);
  return { clauses: prologClauses.split('\n').filter(c => c.trim() !== ''), intermediateModel: jsonModel };
}

export default translateToLogic;
