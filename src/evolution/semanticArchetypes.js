// src/evolution/semanticArchetypes.js

/**
 * Defines the input archetypes for semantic classification.
 * Each archetype has an ID and a descriptive phrase that captures its essence.
 * The descriptive phrase will be used to generate an embedding for the archetype.
 */
const inputArchetypes = [
  {
    id: 'definition_request',
    description: 'Request for a definition of a term or concept.',
    examples: ['What is X?', 'Define X.', 'Tell me about Y.'],
  },
  {
    id: 'causal_assertion',
    description: 'Statement asserting a cause-and-effect relationship.',
    examples: ['X causes Y.', 'Y is a result of X.', 'A leads to B.'],
  },
  {
    id: 'factual_assertion',
    description:
      'Statement asserting a general fact, property, or relationship.',
    examples: [
      'X is Y.',
      'The capital of Z is Q.',
      'Birds can fly.',
      'Water is H2O.',
    ],
  },
  {
    id: 'spatial_query',
    description:
      'Question about the location or spatial relationship of entities.',
    examples: ['Where is X?', 'What is near Y?', 'Is Z inside A?'],
  },
  {
    id: 'temporal_query',
    description: 'Question about time, duration, or sequence of events.',
    examples: [
      'When did X happen?',
      'How long does Y last?',
      'What comes after Z?',
    ],
  },
  {
    id: 'procedural_query',
    description: 'Question about how to perform an action or achieve a goal.',
    examples: [
      'How to do X?',
      'What are the steps for Y?',
      'Show me how to Z.',
    ],
  },
  {
    id: 'comparative_query',
    description:
      'Question that involves comparing two or more entities or concepts.',
    examples: [
      'Is X better than Y?',
      'Compare A and B.',
      'Which is faster, C or D?',
    ],
  },
  {
    id: 'general_query',
    description:
      'A general question that does not neatly fit other specific query archetypes.',
    examples: ['Tell me more about X.', 'Can you help with Y?'],
  },
  {
    id: 'general_assert',
    description:
      'A general assertion or statement that does not neatly fit other specific assertion archetypes.',
    examples: ['I think X is interesting.', 'This is a statement about Y.'],
  },
  // Add more archetypes as needed
];

module.exports = {
  inputArchetypes,
};
