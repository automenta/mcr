const ExampleBase = require('./ExampleBase'); // Use the new base class
const { readFileContentSafe } = require('./demoUtils'); // Import the utility
const path = require('path');

class FamilyOntologyDemo extends ExampleBase {
  // constructor(sessionId, logCollector) { // No constructor needed if just calling super
  //   super(sessionId, logCollector);
  // }

  getName() {
    return 'Family Ontology';
  }

  getDescription() {
    return 'Demonstrates reasoning with a pre-loaded family ontology (family.pl).';
  }

  async run() {
    this.dLog.step('Starting Family Ontology Demo');

    await this.createSession();
    if (!this.sessionId) {
      this.dLog.error('Demo cannot continue without a session.');
      return;
    }

    this.dLog.divider();
    this.dLog.step('Loading Family Ontology');

    const ontologyPath = path.resolve(__dirname, '../../ontologies/family.pl');
    this.dLog.info('Attempting to load ontology from path', ontologyPath);

    const ontologyContent = readFileContentSafe(
      ontologyPath,
      'Family Ontology'
    );

    if (!ontologyContent) {
      this.dLog.error(
        `Family ontology file (${path.basename(ontologyPath)}) could not be read from ${ontologyPath}. Demo cannot proceed with ontology loading.`
      );
      return;
    }

    this.dLog.info(
      'Ontology content snippet (first 200 chars)',
      ontologyContent.substring(0, 200) + '...'
    );

    try {
      // Use the standard /assert endpoint, but specify type as 'prolog'
      const assertResponse = await this.assertFact(ontologyContent, 'prolog');

      if (
        assertResponse &&
        assertResponse.addedFacts &&
        assertResponse.addedFacts.length > 0
      ) {
        this.dLog.success(
          `Ontology content asserted successfully. Statements found by server: ${assertResponse.addedFacts.length}`
        );
        // Optionally, log a few of the added facts if needed
        // assertResponse.addedFacts.slice(0, 5).forEach(f => this.dLog.logic('Sample loaded rule', f));
      } else if (assertResponse && assertResponse.message) {
        // This case might occur if the server accepted it but didn't explicitly list addedFacts,
        // or if it considered them already present, etc.
        this.dLog.info(
          'Ontology assertion processed, but no new facts explicitly reported or message indicates other status.',
          assertResponse.message
        );
        // If the message suggests an issue, treat it as an error for demo purposes
        if (
          assertResponse.message.toLowerCase().includes('error') ||
          assertResponse.message.toLowerCase().includes('fail')
        ) {
          this.dLog.error(
            'Ontology assertion may have failed based on server message.',
            assertResponse.message
          );
          return;
        }
      } else {
        this.dLog.error(
          'Ontology assertion failed or server response was not as expected.'
        );
        return; // Stop if ontology loading fails
      }
    } catch (error) {
      // This catch is more for unexpected errors during the assertFact call itself,
      // as assertFact already has internal error handling via handleApiError.
      this.dLog.error(
        'Critical error during family ontology assertion step',
        error.message
      );
      this.dLog.error(
        'Cannot proceed without the ontology loaded for this demo.'
      );
      return; // Stop if API call itself fails
    }

    this.dLog.divider();
    this.dLog.step('Asserting Additional Facts (Optional)');
    await this.assertFact('Lisa is a student.');
    await this.assertFact('Maggie is a baby.');
    this.dLog.success('Additional facts asserted.');

    this.dLog.divider();
    this.dLog.step('Querying Family Relationships');

    const familyQueries = [
      { q: "Who is Homer's wife?", expected: 'Marge' },
      { q: "Who are Bart's parents?", expected: ['Homer', 'Marge'] },
      { q: 'Is Bart male?', expected: 'yes' },
      { q: "Who is Bart's grandfather?", expected: 'Abraham' },
      { q: "Is Lisa Homer's daughter?", expected: 'yes' },
      { q: "Who are Abraham's children?", expected: ['Homer', 'Herb'] }, // Herb might not be in all versions of family.pl
      { q: "Is Mona Abraham's wife?", expected: 'yes' },
      { q: "What is Lisa's occupation?", expected: 'student' },
    ];

    for (const item of familyQueries) {
      const result = await this.query(item.q);
      if (result && typeof result.answer === 'string') {
        // Ensure answer is a string
        let conditionMet = false;
        if (Array.isArray(item.expected)) {
          conditionMet = item.expected.every((exp) =>
            result.answer.toLowerCase().includes(exp.toLowerCase())
          );
          await this.assertCondition(
            conditionMet,
            `Query "${item.q}" -> Answer: "${result.answer}" (Expected to include all: [${item.expected.join(', ')}])`,
            `Query "${item.q}" -> Answer: "${result.answer}" (Expected to include all: [${item.expected.join(', ')}], but did not)`
          );
        } else {
          conditionMet = result.answer
            .toLowerCase()
            .includes(item.expected.toLowerCase());
          await this.assertCondition(
            conditionMet,
            `Query "${item.q}" -> Answer: "${result.answer}" (Expected: "${item.expected}")`,
            `Query "${item.q}" -> Answer: "${result.answer}" (Expected: "${item.expected}", but was different)`
          );
        }
      } else {
        await this.assertCondition(
          false,
          '',
          `Query "${item.q}" failed, returned no result, or result.answer was not a string.`
        );
        if (result)
          this.dLog.info('Unexpected result structure for query', {
            query: item.q,
            result,
          });
      }
    }

    this.dLog.success('Family ontology queries completed.');
    this.dLog.divider();
  }
}

module.exports = FamilyOntologyDemo;
// For ES module compatibility if ever needed
// export default FamilyOntologyDemo;
