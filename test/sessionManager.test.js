const SessionManager = require('../src/sessionManager');
// const { v4: uuidv4 } = require('uuid'); // Unused import
const fs = require('fs');
const path = require('path');
const logger = require('../src/logger');
// const ApiError = require('../src/errors'); // No longer needed here
// const ConfigManager = require('../src/config'); // Unused import

// Remove const mockUuidv4 = jest.fn(); from here

jest.mock('uuid', () => ({
  v4: jest.fn(), // Directly make v4 a jest.fn
}));

jest.mock('fs');
jest.mock('path');
jest.mock('../src/logger');

// Properly mock ApiError as a class constructor
jest.mock('../src/errors', () => {
  const ActualApiErrorInsideMock = jest.requireActual('../src/errors'); // Require it inside
  return jest.fn().mockImplementation((status, message, code) => {
    const err = new ActualApiErrorInsideMock(status, message, code); // Use the inside-mock version
    // const err = new Error(message);
    // err.statusCode = status;
    // err.errorCode = code;
    // err.name = 'ApiError'; // Important for some checks
    return err;
  });
});

// For instanceof checks in tests
const ActualApiError = jest.requireActual('../src/errors');

// Define these constants before they are used in the config mock
// const MOCK_SESSION_STORAGE_PATH = '/mocked_storage/sessions_data_sm_test'; // Will be defined after mock
// const MOCK_ONTOLOGY_STORAGE_PATH = '/mocked_storage/ontologies_data_sm_test'; // Will be defined after mock

jest.mock('../src/config', () => {
  // Inline paths for the mock factory
  const mockSessionPathForFactory =
    '/mocked_storage/sessions_data_sm_test_for_factory';
  const mockOntologyPathForFactory =
    '/mocked_storage/ontologies_data_sm_test_for_factory';
  return {
    get: jest.fn(() => ({
      session: { storagePath: mockSessionPathForFactory },
      ontology: { storagePath: mockOntologyPathForFactory },
      logging: { level: 'info' },
      llm: { provider: 'test-provider' },
    })),
    load: jest.fn(() => ({
      session: { storagePath: mockSessionPathForFactory },
      ontology: { storagePath: mockOntologyPathForFactory },
      logging: { level: 'info' },
      llm: { provider: 'test-provider' },
    })),
  };
});

// Define constants for use within the test descriptions/assertions
const MOCK_SESSION_STORAGE_PATH =
  '/mocked_storage/sessions_data_sm_test_for_factory';
const MOCK_ONTOLOGY_STORAGE_PATH =
  '/mocked_storage/ontologies_data_sm_test_for_factory';

describe('SessionManager', () => {
  // let uuidv4; // Not needed here due to new mock style

  beforeAll(() => {
    // path.resolve and path.join are critical for SessionManager's file operations.
    // Their mocks should correctly reflect how paths are constructed.
    // We can still re-assert its return value or clear mocks in beforeEach if needed.
    path.resolve.mockImplementation((p) => p);
    path.join.mockImplementation((...args) => args.join('/'));

    fs.existsSync.mockReturnValue(true);
    fs.mkdirSync.mockReturnValue(undefined);

    SessionManager._sessions = {};
    SessionManager._ontologies = {};
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    SessionManager._sessions = {};
    SessionManager._ontologies = {};
  });

  describe('Initialization', () => {
    test('should create session and ontology storage directories if they do not exist', () => {
      fs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(false);
      require('../src/sessionManager');
      expect(fs.mkdirSync).toHaveBeenCalledWith(MOCK_SESSION_STORAGE_PATH, {
        recursive: true,
      });
      expect(fs.mkdirSync).toHaveBeenCalledWith(MOCK_ONTOLOGY_STORAGE_PATH, {
        recursive: true,
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created session storage directory')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created ontology storage directory')
      );
    });

    test('should not create directories if they already exist', () => {
      require('../src/sessionManager');
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    test('should load all ontologies on initialization', () => {
      fs.readdirSync.mockReturnValue(['family.pl', 'another.pl']);
      fs.readFileSync
        .mockReturnValueOnce('parent(X,Y).') // Content for family.pl
        .mockReturnValueOnce('rule(A,B).'); // Content for another.pl

      jest.resetModules();
      // At this point, SessionManager is reloaded. If it imports uuid, it gets our top-level mock.
      const FreshSessionManager = require('../src/sessionManager');
      // mockUuidv4 is already defined and is the mock function for uuid.v4

      expect(fs.readdirSync).toHaveBeenCalledWith(MOCK_ONTOLOGY_STORAGE_PATH);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        `${MOCK_ONTOLOGY_STORAGE_PATH}/family.pl`,
        'utf8'
      );
      expect(fs.readFileSync).toHaveBeenCalledWith(
        `${MOCK_ONTOLOGY_STORAGE_PATH}/another.pl`,
        'utf8'
      );
      expect(FreshSessionManager._ontologies).toEqual({
        family: 'parent(X,Y).',
        another: 'rule(A,B).',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          `Loaded ${Object.keys(FreshSessionManager._ontologies).length} ontologies`
        )
      );
    });
  });

  describe('Session Management', () => {
    beforeEach(() => {
      // Ensure uuidv4 is available for each test in this block
      // No, uuid should be mocked at the top of the file once.
      // uuidv4 = require('uuid').v4; // This is not needed here if mocked globally
    });

    test('create should generate a new session and save it', () => {
      const { v4: mockUuidv4 } = require('uuid');
      const mockUuid = 'test-session-id';
      mockUuidv4.mockReturnValue(mockUuid);

      const session = SessionManager.create();

      expect(session.sessionId).toBe(mockUuid);
      expect(session.createdAt).toBeDefined();
      expect(session.facts).toEqual([]);
      expect(session.factCount).toBe(0);
      expect(SessionManager._sessions[mockUuid]).toBe(session);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${MOCK_SESSION_STORAGE_PATH}/${mockUuid}.json`,
        JSON.stringify(session, null, 2)
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Created new session: ${mockUuid}`
      );
    });

    test('_saveSession should throw ApiError if fs.writeFileSync fails', () => {
      const { v4: mockUuidv4 } = require('uuid');
      const mockUuid = 'save-fail-id';
      mockUuidv4.mockReturnValue(mockUuid);
      // ApiError is already mocked as a class constructor mock at the top

      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => SessionManager.create()).toThrow(
        expect.objectContaining({
          name: 'ApiError',
          statusCode: 500,
          message: expect.stringMatching(/Failed to save session save-fail-id: Disk full/),
          errorCode: 'SESSION_SAVE_OPERATION_FAILED',
        })
      );
      expect(() => SessionManager.create()).toThrow(ActualApiError);
    });

    test('get should retrieve an existing session from memory', () => {
      const mockSession = { sessionId: 'existing-id', facts: ['fact1.'] };
      SessionManager._sessions['existing-id'] = mockSession;

      const session = SessionManager.get('existing-id');
      expect(session).toBe(mockSession);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    test('get should load a session from file if not in memory', () => {
      const mockSession = { sessionId: 'file-id', facts: ['fact2.'] };
      fs.readFileSync.mockReturnValue(JSON.stringify(mockSession));

      const session = SessionManager.get('file-id');
      expect(session).toEqual(mockSession);
      expect(SessionManager._sessions['file-id']).toEqual(mockSession);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        `${MOCK_SESSION_STORAGE_PATH}/file-id.json`,
        'utf8'
      );
    });

    test('get should throw ApiError if session not found', () => {
      fs.existsSync.mockReturnValue(false);
      fs.existsSync.mockReturnValue(false); // Ensure it attempts to load then fails

      expect(() => SessionManager.get('non-existent-id')).toThrow(
        expect.objectContaining({
          name: 'ApiError', // ActualApiError constructor sets this name
          statusCode: 404,
          message: "Session with ID 'non-existent-id' not found.",
          errorCode: 'SESSION_NOT_FOUND',
        })
      );
      // Also ensure it's an instance of the correct class
      expect(() => SessionManager.get('non-existent-id')).toThrow(ActualApiError);
    });

    test('delete should remove session from memory and delete its file', () => {
      const mockSession = { sessionId: 'delete-id', facts: [] };
      SessionManager._sessions['delete-id'] = mockSession;
      fs.existsSync.mockReturnValue(true);

      SessionManager.delete('delete-id');

      expect(SessionManager._sessions['delete-id']).toBeUndefined();
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        `${MOCK_SESSION_STORAGE_PATH}/delete-id.json`
      );
      expect(logger.info).toHaveBeenCalledWith('Terminated session: delete-id');
    });

    test('delete should not throw if session file does not exist', () => {
      const mockSession = { sessionId: 'delete-no-file-id', facts: [] };
      SessionManager._sessions['delete-no-file-id'] = mockSession;
      fs.existsSync.mockReturnValue(false);

      expect(() => SessionManager.delete('delete-no-file-id')).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    test('addFacts should add new facts to a session and save it', () => {
      const mockSession = {
        sessionId: 'add-facts-id',
        facts: ['initial_fact.'],
      };
      SessionManager._sessions['add-facts-id'] = mockSession;

      const newFacts = ['new_fact_1.', 'new_fact_2.'];
      SessionManager.addFacts('add-facts-id', newFacts);

      expect(mockSession.facts).toEqual([
        'initial_fact.',
        'new_fact_1.',
        'new_fact_2.',
      ]);
      expect(mockSession.factCount).toBe(3);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${MOCK_SESSION_STORAGE_PATH}/add-facts-id.json`,
        JSON.stringify(mockSession, null, 2)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Session add-facts-id: Asserted 2 new facts.'
      );
    });
  });

  describe('Ontology Management', () => {
    test('addOntology should add a new ontology and save it', () => {
      const ontologyName = 'test_ontology';
      const rules = `rule1.
rule2.`;

      const result = SessionManager.addOntology(ontologyName, rules);

      expect(result).toEqual({ name: ontologyName, rules });
      expect(SessionManager._ontologies[ontologyName]).toBe(rules);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${MOCK_ONTOLOGY_STORAGE_PATH}/${ontologyName}.pl`,
        rules
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Added new ontology: ${ontologyName}`
      );
    });

    test('addOntology should throw ApiError if ontology already exists', () => {
      SessionManager._ontologies['existing_ontology'] = 'some_rules.';
      SessionManager._ontologies['existing_ontology'] = 'some_rules.';

      expect(() => SessionManager.addOntology('existing_ontology', 'new_rules.')).toThrow(
        expect.objectContaining({
          name: 'ApiError',
          statusCode: 409,
          message: "Ontology with name 'existing_ontology' already exists.",
          errorCode: 'ONTOLOGY_ALREADY_EXISTS',
        })
      );
      expect(() => SessionManager.addOntology('existing_ontology', 'new_rules.')).toThrow(ActualApiError);
    });

    test('updateOntology should update an existing ontology and save it', () => {
      const ontologyName = 'update_ontology';
      SessionManager._ontologies[ontologyName] = 'old_rules.';
      const newRules = `updated_rule1.
updated_rule2.`;

      const result = SessionManager.updateOntology(ontologyName, newRules);

      expect(result).toEqual({ name: ontologyName, rules: newRules });
      expect(SessionManager._ontologies[ontologyName]).toBe(newRules);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${MOCK_ONTOLOGY_STORAGE_PATH}/${ontologyName}.pl`,
        newRules
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Updated ontology: ${ontologyName}`
      );
    });

    test('updateOntology should throw ApiError if ontology not found', () => {
      // Ensure the ontology is not in memory and _loadOntology will return null for it
      delete SessionManager._ontologies['non_existent_ontology'];
      fs.existsSync.mockReturnValue(false); // Mock that the file doesn't exist for _loadOntology

      expect(() => SessionManager.updateOntology('non_existent_ontology', 'rules.')).toThrow(
        expect.objectContaining({
          name: 'ApiError',
          statusCode: 404,
          message: "Ontology with name 'non_existent_ontology' not found.",
          errorCode: 'ONTOLOGY_NOT_FOUND',
        })
      );
      expect(() => SessionManager.updateOntology('non_existent_ontology', 'rules.')).toThrow(ActualApiError);
    });

    test('getOntologies should return all loaded ontologies', () => {
      SessionManager._ontologies = {
        onto1: 'rules1.',
        onto2: 'rules2.',
      };
      const ontologies = SessionManager.getOntologies();
      expect(ontologies).toEqual([
        { name: 'onto1', rules: 'rules1.' },
        { name: 'onto2', rules: 'rules2.' },
      ]);
    });

    test('getOntology should return a specific ontology', () => {
      SessionManager._ontologies['specific_onto'] = 'specific_rules.';
      const ontology = SessionManager.getOntology('specific_onto');
      expect(ontology).toEqual({
        name: 'specific_onto',
        rules: 'specific_rules.',
      });
    });

    test('getOntology should throw ApiError if ontology not found', () => {
      // Ensure the ontology is not in memory and _loadOntology will return null for it
      delete SessionManager._ontologies['non_existent_onto'];
      fs.existsSync.mockReturnValue(false); // Mock that the file doesn't exist for _loadOntology

      expect(() => SessionManager.getOntology('non_existent_onto')).toThrow(
        expect.objectContaining({
          name: 'ApiError',
          statusCode: 404,
          message: "Ontology with name 'non_existent_onto' not found.",
          errorCode: 'ONTOLOGY_NOT_FOUND',
        })
      );
      expect(() => SessionManager.getOntology('non_existent_onto')).toThrow(ActualApiError);
    });

    test('deleteOntology should remove ontology from memory and delete its file', () => {
      SessionManager._ontologies['delete_onto'] = 'rules_to_delete.';
      fs.existsSync.mockReturnValue(true);

      const result = SessionManager.deleteOntology('delete_onto');

      expect(result).toEqual({ message: 'Ontology delete_onto deleted.' });
      expect(SessionManager._ontologies['delete_onto']).toBeUndefined();
      expect(fs.unlinkSync).toHaveBeenCalledWith(
        `${MOCK_ONTOLOGY_STORAGE_PATH}/delete_onto.pl`
      );
      expect(logger.info).toHaveBeenCalledWith('Deleted ontology: delete_onto');
    });

    test('deleteOntology should not throw if ontology file does not exist', () => {
      SessionManager._ontologies['delete_no_file_onto'] = 'rules.';
      fs.existsSync.mockReturnValue(false);

      expect(() =>
        SessionManager.deleteOntology('delete_no_file_onto')
      ).not.toThrow();
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('Fact and Ontology Combination', () => {
    test('getFactsWithOntology should combine session facts and loaded ontologies', () => {
      const mockSession = {
        sessionId: 'combine-id',
        facts: ['session_fact_1.', 'session_fact_2.'],
      };
      SessionManager._sessions['combine-id'] = mockSession;
      SessionManager._ontologies = {
        family: `parent(X,Y).
child(Y,X) :- parent(X,Y).`,
        animals: `cat(whiskers).
dog(buddy).`,
      };

      const combinedFacts = SessionManager.getFactsWithOntology('combine-id');
      expect(combinedFacts).toEqual([
        'session_fact_1.',
        'session_fact_2.',
        'parent(X,Y).',
        'child(Y,X) :- parent(X,Y).',
        'cat(whiskers).',
        'dog(buddy).',
      ]);
    });

    test('getFactsWithOntology should prioritize additionalOntology if provided', () => {
      const mockSession = {
        sessionId: 'combine-id-2',
        facts: ['session_fact_A.'],
      };
      SessionManager._sessions['combine-id-2'] = mockSession;
      SessionManager._ontologies = {
        family: 'parent(X,Y).',
      };
      const additionalOntology = `% This is a comment
new_rule(X).`;

      const combinedFacts = SessionManager.getFactsWithOntology(
        'combine-id-2',
        additionalOntology
      );
      expect(combinedFacts).toEqual(['session_fact_A.', 'new_rule(X).']);
    });

    test('getNonSessionOntologyFacts should return only ontology facts not in session', () => {
      const mockSession = {
        sessionId: 'non-session-id',
        facts: ['common_fact.'],
      };
      SessionManager._sessions['non-session-id'] = mockSession;
      SessionManager._ontologies = {
        test_onto: `common_fact.
unique_onto_fact.`,
      };

      const nonSessionFacts =
        SessionManager.getNonSessionOntologyFacts('non-session-id');
      expect(nonSessionFacts).toEqual(['unique_onto_fact.']);
    });
  });
});
