const { Example } = require('../../demo'); // Adjust path as necessary

class ScientificKBDemo extends Example {
  getName() {
    return 'Scientific KB';
  }

  getDescription() {
    return 'A demo asserting facts about a simple scientific domain (chemistry/physics) and querying them.';
  }

  async run() {
    this.dLog.step('Starting Scientific KB Demo');

    await this.createSession();
    if (!this.sessionId) {
      this.dLog.error('Demo cannot continue without a session.');
      return;
    }

    this.dLog.divider();
    this.dLog.step('Asserting Scientific Facts');
    const factsToAssert = [
      // Basic Chemistry
      'Water is H2O.',
      'H2O is a molecule.',
      'Table salt is NaCl.',
      'NaCl is a molecule.',
      'Oxygen is O.',
      'O is an atom.',
      'Hydrogen is H.',
      'H is an atom.',
      'Sodium is Na.',
      'Na is an atom.',
      'Chlorine is Cl.',
      'Cl is an atom.',
      'A molecule is composed of atoms.', // General rule
      'H2O is composed of Hydrogen and Oxygen.', // Specific composition
      'NaCl is composed of Sodium and Chlorine.', // Specific composition

      // Basic Physics
      'Gravity is a force.',
      'The Earth has gravity.',
      'The Moon orbits the Earth.',
      'A force can cause acceleration.', // General rule
      'Gravity causes apples to fall from trees.',
    ];

    for (const fact of factsToAssert) {
      await this.assertFact(fact);
    }
    this.dLog.success('Scientific facts asserted successfully.');

    this.dLog.divider();
    this.dLog.step('Querying Scientific Knowledge Base');
    const queries = [
      // Chemistry Queries
      { q: 'What is H2O?', expected: 'Water' }, // or "H2O is a molecule"
      { q: 'Is H2O a molecule?', expected: 'yes' },
      { q: 'What is table salt?', expected: 'NaCl' },
      { q: 'What is O?', expected: 'Oxygen' }, // or "O is an atom"
      { q: 'Is Na an atom?', expected: 'yes' },
      { q: 'What are molecules composed of?', expected: 'atoms' },
      { q: 'What is H2O composed of?', expected: ['Hydrogen', 'Oxygen'] },
      { q: 'What is NaCl composed of?', expected: ['Sodium', 'Chlorine'] },

      // Physics Queries
      { q: 'What is gravity?', expected: 'force' },
      { q: 'Does the Earth have gravity?', expected: 'yes' },
      { q: 'What orbits the Earth?', expected: 'Moon' },
      { q: 'What can cause acceleration?', expected: 'force' },
      { q: 'What causes apples to fall from trees?', expected: 'Gravity' },
      { q: 'Is the sun a star?', expected: 'I don\'t know' }, // Example of something not in KB
    ];

    for (const item of queries) {
      const result = await this.query(item.q);

      if (!result || typeof result.answer !== 'string') {
        this.dLog.error(
          `Query "${item.q}" failed or returned unexpected result structure.`
        );
        if (result) {
          this.dLog.info('Unexpected result structure:', {
            query: item.q,
            result,
          });
        }
        // Check if "I don't know" was expected for this failed query
        if (
          typeof item.expected === 'string' &&
          item.expected.toLowerCase().includes("don't know")
        ) {
          await this.assertCondition(
            true,
            `Query "${item.q}" correctly returned no specific answer, as expected ("${item.expected}").`,
            '' // Should not happen
          );
        } else {
          await this.assertCondition(
            false,
            '',
            `Query "${item.q}" failed or returned no string answer.`
          );
        }
        continue; // Move to the next query
      }

      // At this point, result and result.answer are valid
      const answerLower = result.answer.toLowerCase();
      let conditionMet = false;
      let successMessage = '';
      let failureMessage = '';

      if (Array.isArray(item.expected)) {
        conditionMet = item.expected.every((exp) =>
          answerLower.includes(exp.toLowerCase())
        );
        const expectedStr = `[${item.expected.join(', ')}]`;
        successMessage = `Query "${item.q}" -> Answer: "${result.answer}" (Correctly included all: ${expectedStr})`;
        failureMessage = `Query "${item.q}" -> Answer: "${result.answer}" (Expected to include all: ${expectedStr}, but did not)`;
      } else if (typeof item.expected === 'string') {
        conditionMet = answerLower.includes(item.expected.toLowerCase());
        successMessage = `Query "${item.q}" -> Answer: "${result.answer}" (Matches expected: "${item.expected}")`;
        failureMessage = `Query "${item.q}" -> Answer: "${result.answer}" (Expected: "${item.expected}", but was different or not found)`;

        // Special handling for "I don't know" if it was expected and met
        if (
          item.expected.toLowerCase().includes("don't know") &&
          conditionMet
        ) {
          successMessage = `Query "${item.q}" correctly answered with a variation of "I don't know": "${result.answer}"`;
        }
      } else {
        this.dLog.error(
          `Invalid 'item.expected' type for query: ${item.q}. Expected string or array.`
        );
        conditionMet = false; // Mark as failed if expected type is wrong
        failureMessage = `Query "${item.q}" -> Invalid test configuration: 'item.expected' has unexpected type.`;
      }

      await this.assertCondition(conditionMet, successMessage, failureMessage);
    }
    this.dLog.success('Scientific KB queries completed.');
    this.dLog.divider();
  }
}

module.exports = ScientificKBDemo;
