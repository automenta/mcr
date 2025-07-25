import MCR from '../index.js';
import { generateExample, generateOntology } from './utility.js';

let mcr;

export async function handleWebSocketConnection(ws) {
  if (!mcr) {
    mcr = await MCR.create();
  }

  ws.on('message', async (message) => {
    try {
      const { type, tool, ...payload } = JSON.parse(message);
      if (type !== 'invoke') {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message type' }));
        return;
      }

      let result;
      switch (tool) {
        case 'mcr.handle':
          result = await mcr.handle(payload);
          break;
        case 'util.generate_example':
          result = await generateExample(payload.domain, payload.instructions);
          break;
        case 'util.generate_ontology':
          result = await generateOntology(payload.domain, payload.instructions);
          break;
        // Add other tool handlers here
        default:
          result = { error: 'Unknown tool' };
      }

      ws.send(JSON.stringify({ type: 'result', ...result }));
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.send(JSON.stringify({ type: 'connection_ack' }));
}
