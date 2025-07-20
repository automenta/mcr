import { McrConnection } from './McrConnection.js';

export class MessageHandler {
  constructor(sessionId) {
    this.mcrConnection = new McrConnection();
    this.sessionId = sessionId;
  }

  async sendMessage(message) {
    return this.mcrConnection.invoke('mcr.handle', {
      sessionId: this.sessionId,
      naturalLanguageText: message,
    });
  }
}
