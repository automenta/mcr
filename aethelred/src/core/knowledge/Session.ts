import { v4 as uuidv4 } from 'uuid';
import type { IKnowledgeBase } from './KnowledgeBase';
import { PrologKnowledgeBase } from './KnowledgeBase';

/**
 * Interface for a reasoning session.
 * A session encapsulates a unique ID and a knowledge base.
 */
export interface ISession {
  readonly id: string;
  knowledgeBase: IKnowledgeBase;
  readonly createdAt: Date;
  lastAccessedAt: Date;

  touch(): void;
}

/**
 * Implementation of ISession.
 */
export class Session implements ISession {
  readonly id: string;
  knowledgeBase: IKnowledgeBase;
  readonly createdAt: Date;
  lastAccessedAt: Date;

  constructor(id?: string, knowledgeBase?: IKnowledgeBase) {
    this.id = id || uuidv4();
    this.knowledgeBase = knowledgeBase || new PrologKnowledgeBase();
    this.createdAt = new Date();
    this.lastAccessedAt = new Date();
  }

  touch(): void {
    this.lastAccessedAt = new Date();
  }
}
