const SessionManager = require('../src/sessionManager');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../src/logger');
const ApiError = require('../src/errors');
// const ConfigManager = require('../src/config'); // Unused import

const mockUuidv4 = jest.fn();
jest.mock('uuid', () => ({
  v4: mockUuidv4,
}));

jest.mock('fs');
jest.mock('path');
jest.mock('../src/logger');

// Properly mock ApiError as a class constructor
const ActualApiError = jest.requireActual('../src/errors');
jest.mock('../src/errors', () => {
  return jest.fn().mockImplementation((status, message, code) => {
    const err = new ActualApiError(status, message, code); // Use the actual class for instanceof checks
    // const err = new Error(message);
    // err.statusCode = status;
    // err.errorCode = code;
    // err.name = 'ApiError'; // Important for some checks
    return err;
  });
});

const MOCK_SESSION_STORAGE_PATH = '/mocked_storage/sessions_data_sm_test';
const MOCK_ONTOLOGY_STORAGE_PATH = '/mocked_storage/ontologies_data_sm_test';

jest.mock('../src/config', () => {
  const actualConfigManager = jest.requireActual('../src/config');
  return {
    ...actualConfigManager,
    get: jest.fn(() => ({
      session: { storagePath: MOCK_SESSION_STORAGE_PATH },
      ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH },
      logging: { level: 'info' },
      llm: { provider: 'test-provider' },
    })),
    load: jest.fn(() => ({
      session: { storagePath: MOCK_SESSION_STORAGE_PATH },
      ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH },
      logging: { level: 'info' },
      llm: { provider: 'test-provider' },
    })),
  };
});

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
      const mockUuid = 'test-session-id';
      mockUuidv4.mockReturnValue(mockUuid); // Use the imported mock function

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
      const mockUuid = 'save-fail-id';
      mockUuidv4.mockReturnValue(mockUuid); // Use the imported mock function
      // ApiError is already mocked as a class constructor mock at the top

      fs.writeFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      // We need to catch the error to inspect its properties if toThrow(ApiError) is not specific enough
      try {
        SessionManager.create();
        // Should not reach here
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeInstanceOf(ActualApiError); // Check it's an instance of the *actual* ApiError class due to mock
        expect(e.statusCode).toBe(500);
        expect(e.message).toMatch(
          /Failed to save session save-fail-id: Disk full/
        );
        expect(e.errorCode).toBe('SESSION_SAVE_OPERATION_FAILED');
      }

      // More direct way if `toThrow` works with the class mock correctly
      // This checks if an error that is an instanceof ApiError (via the mock) is thrown.
      expect(() => SessionManager.create()).toThrow(ActualApiError);

      // To check the specific message with toThrow:
      expect(() => SessionManager.create()).toThrow(
        /Failed to save session save-fail-id: Disk full/
      );
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
      ApiError.mockImplementation((status, message) => ({ status, message }));

      expect(() => SessionManager.get('non-existent-id')).toThrow(ApiError);
      expect(() => SessionManager.get('non-existent-id')).toThrow(
        "Session with ID 'non-existent-id' not found."
      );
      expect(ApiError).toHaveBeenCalledWith(
        404,
        "Session with ID 'non-existent-id' not found."
      );
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
      ApiError.mockImplementation((status, message) => ({ status, message }));

      expect(() =>
        SessionManager.addOntology('existing_ontology', 'new_rules.')
      ).toThrow(ApiError);
      expect(() =>
        SessionManager.addOntology('existing_ontology', 'new_rules.')
      ).toThrow("Ontology with name 'existing_ontology' already exists.");
      expect(ApiError).toHaveBeenCalledWith(
        409,
        "Ontology with name 'existing_ontology' already exists."
      );
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
      ApiError.mockImplementation((status, message) => ({ status, message }));

      expect(() =>
        SessionManager.updateOntology('non_existent_ontology', 'rules.')
      ).toThrow(ApiError);
      expect(() =>
        SessionManager.updateOntology('non_existent_ontology', 'rules.')
      ).toThrow("Ontology with name 'non_existent_ontology' not found.");
      expect(ApiError).toHaveBeenCalledWith(
        404,
        "Ontology with name 'non_existent_ontology' not found."
      );
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
      ApiError.mockImplementation((status, message) => ({ status, message }));
      expect(() => SessionManager.getOntology('non_existent_onto')).toThrow(
        ApiError
      );
      expect(() => SessionManager.getOntology('non_existent_onto')).toThrow(
        "Ontology with name 'non_existent_onto' not found."
      );
      expect(ApiError).toHaveBeenCalledWith(
        404,
        "Ontology with name 'non_existent_onto' not found."
      );
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
