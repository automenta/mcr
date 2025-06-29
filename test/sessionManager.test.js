// --- TOP OF FILE ---
const MOCK_SESSION_STORAGE_PATH_CONST = '/mocked_storage/sessions_data_sm_test_for_factory';
const MOCK_ONTOLOGY_STORAGE_PATH_CONST = '/mocked_storage/ontologies_data_sm_test_for_factory';

const mockFsExistsSync = jest.fn();
const mockFsMkdirSync = jest.fn();
const mockFsWriteFileSync = jest.fn();
const mockFsReadFileSync = jest.fn();
const mockFsUnlinkSync = jest.fn();
const mockFsReaddirSync = jest.fn();

jest.mock('fs', () => ({
  existsSync: mockFsExistsSync,
  mkdirSync: mockFsMkdirSync,
  writeFileSync: mockFsWriteFileSync,
  readFileSync: mockFsReadFileSync,
  unlinkSync: mockFsUnlinkSync,
  readdirSync: mockFsReaddirSync,
}));

const mockPathResolve = jest.fn();
const mockPathJoin = jest.fn();
const mockPathBasename = jest.fn();

jest.mock('path', () => ({
  resolve: mockPathResolve,
  join: mockPathJoin,
  basename: mockPathBasename,
}));

const mockLoggerInfo = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();
const mockLoggerWarn = jest.fn();

jest.mock('../src/logger', () => ({
  logger: { info: mockLoggerInfo, error: mockLoggerError, debug: mockLoggerDebug, warn: mockLoggerWarn },
}));

const mockUuidV4 = jest.fn();
jest.mock('uuid', () => ({ v4: mockUuidV4 }));

jest.mock('../src/errors', () => {
  const ActualApiErrorInsideFactory = jest.requireActual('../src/errors');
  return jest.fn().mockImplementation(
    (status, message, code) => new ActualApiErrorInsideFactory(status, message, code)
  );
});

jest.mock('../src/config', () => ({
  get: jest.fn(() => ({
    session: { storagePath: MOCK_SESSION_STORAGE_PATH_CONST },
    ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH_CONST },
    logging: { level: 'info' },
    llm: { provider: 'test-provider' },
  })),
  load: jest.fn(() => ({
    session: { storagePath: MOCK_SESSION_STORAGE_PATH_CONST },
    ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH_CONST },
    logging: { level: 'info' },
    llm: { provider: 'test-provider' },
  })),
}));

// We don't need ActualApiError for instanceof if objectContaining checks name and properties
// const ActualApiError = jest.requireActual('../src/errors');
const MOCK_SESSION_STORAGE_PATH = MOCK_SESSION_STORAGE_PATH_CONST;
const MOCK_ONTOLOGY_STORAGE_PATH = MOCK_ONTOLOGY_STORAGE_PATH_CONST;

describe('SessionManager', () => {
  let SessionManager;

  beforeEach(() => {
    jest.resetModules();

    mockFsExistsSync.mockReset().mockReturnValue(true);
    mockFsMkdirSync.mockReset();
    mockFsWriteFileSync.mockReset();
    mockFsReadFileSync.mockReset();
    mockFsUnlinkSync.mockReset();
    mockFsReaddirSync.mockReset().mockReturnValue([]);

    mockPathResolve.mockReset().mockImplementation(p => p);
    mockPathJoin.mockReset().mockImplementation((...args) => args.filter(Boolean).join('/'));
    mockPathBasename.mockReset().mockImplementation((filePath, ext) => {
      if (!filePath) return '';
      const base = filePath.substring(filePath.lastIndexOf('/') + 1);
      if (ext && base.endsWith(ext)) { return base.substring(0, base.length - ext.length); }
      return base;
    });

    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerWarn.mockReset();
    mockUuidV4.mockReset();

    SessionManager = require('../src/sessionManager');
    SessionManager._sessions = {};
    SessionManager._ontologies = {};
  });

  describe('Module Initialization', () => {
    test('should create ontology directory on load and session directory on first use if they do not exist', () => {
      jest.resetModules();
      mockFsExistsSync.mockImplementation(p => {
        if (p === MOCK_SESSION_STORAGE_PATH || p === MOCK_ONTOLOGY_STORAGE_PATH) return false;
        return true;
      });
      mockFsMkdirSync.mockClear();
      mockLoggerInfo.mockClear();

      // Local mock for path for this test
      // const mockPath = require('path'); // Not needed, global mocks are fine if reset
      mockPathResolve.mockImplementation(p => p);
      mockPathJoin.mockImplementation((...args) => args.filter(a => typeof a === 'string').join('/'));

      jest.mock('../src/config', () => ({
        get: () => ({ session: { storagePath: MOCK_SESSION_STORAGE_PATH }, ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }, logging: {level: 'info'}, llm: {provider: 'test'} }),
        load: () => ({ session: { storagePath: MOCK_SESSION_STORAGE_PATH }, ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }, logging: {level: 'info'}, llm: {provider: 'test'} })
      }));

      const CurrentSessionManager = require('../src/sessionManager');

      // Assertions for ontology directory (created on load via _loadAllOntologies)
      expect(mockFsMkdirSync).toHaveBeenCalledWith(MOCK_ONTOLOGY_STORAGE_PATH, { recursive: true });
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Created ontology storage directory'));

      // Ensure session directory wasn't created yet by just loading the module
      expect(mockFsMkdirSync).not.toHaveBeenCalledWith(MOCK_SESSION_STORAGE_PATH, { recursive: true });

      // Trigger session directory creation by calling a method that uses it
      mockUuidV4.mockReturnValue('test-uuid-for-dir-creation'); // create() needs a uuid
      CurrentSessionManager.create();

      // Assertions for session directory (created on first use)
      expect(mockFsMkdirSync).toHaveBeenCalledWith(MOCK_SESSION_STORAGE_PATH, { recursive: true });
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Created session storage directory'));

      // Check total calls to mkdirSync - should be one for ontology, one for session
      expect(mockFsMkdirSync).toHaveBeenCalledTimes(2);
    });

    test('should not create directories if they already exist', () => {
      jest.resetModules();
      mockFsExistsSync.mockReturnValue(true);
      mockFsMkdirSync.mockClear();
      mockLoggerInfo.mockClear();
      jest.mock('../src/config', () => ({
        get: () => ({ session: { storagePath: MOCK_SESSION_STORAGE_PATH }, ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }, logging: {level: 'info'}, llm: {provider: 'test'} }),
        load: () => ({ session: { storagePath: MOCK_SESSION_STORAGE_PATH }, ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }, logging: {level: 'info'}, llm: {provider: 'test'} })
      }));
      require('../src/sessionManager');
      expect(mockFsMkdirSync).not.toHaveBeenCalled();
    });

    test('should load all ontologies on initialization', () => {
      jest.resetModules();
      mockFsExistsSync.mockImplementation(p => {
        // Should return true for the ontology directory itself, and for the individual files
        if (p === MOCK_ONTOLOGY_STORAGE_PATH) return true;
        if (p === `${MOCK_ONTOLOGY_STORAGE_PATH}/family.pl`) return true;
        if (p === `${MOCK_ONTOLOGY_STORAGE_PATH}/another.pl`) return true;
        // Also for session storage path if it's checked during the same SUT load
        if (p === MOCK_SESSION_STORAGE_PATH) return true;
        return false; // Default to false for other paths not explicitly handled
      });
      mockFsReaddirSync.mockReturnValue(['family.pl', 'another.pl']);
      mockFsReadFileSync.mockImplementation((filePath) => {
        if (filePath === `${MOCK_ONTOLOGY_STORAGE_PATH}/family.pl`) return 'parent(X,Y).';
        if (filePath === `${MOCK_ONTOLOGY_STORAGE_PATH}/another.pl`) return 'rule(A,B).';
        return '';
      });
      mockLoggerInfo.mockClear();
      mockPathResolve.mockImplementation(p => p);
      mockPathJoin.mockImplementation((...args) => args.filter(Boolean).join('/'));
      mockPathBasename.mockImplementation((filePath, ext) => {
        if (!filePath) return '';
        const base = filePath.substring(filePath.lastIndexOf('/') + 1);
        if (ext && base.endsWith(ext)) { return base.substring(0, base.length - ext.length); }
        return base;
      });
      jest.mock('../src/config', () => ({
        get: () => ({ session: { storagePath: MOCK_SESSION_STORAGE_PATH }, ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }, logging: {level: 'info'}, llm: {provider: 'test'} }),
        load: () => ({ session: { storagePath: MOCK_SESSION_STORAGE_PATH }, ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }, logging: {level: 'info'}, llm: {provider: 'test'} })
      }));
      const CurrentTestSessionManager = require('../src/sessionManager');
      expect(mockFsReaddirSync).toHaveBeenCalledWith(MOCK_ONTOLOGY_STORAGE_PATH);
      expect(mockFsReadFileSync).toHaveBeenCalledWith(`${MOCK_ONTOLOGY_STORAGE_PATH}/family.pl`, 'utf8');
      expect(mockFsReadFileSync).toHaveBeenCalledWith(`${MOCK_ONTOLOGY_STORAGE_PATH}/another.pl`, 'utf8');
      expect(CurrentTestSessionManager._ontologies).toEqual({ family: 'parent(X,Y).', another: 'rule(A,B).' });
      expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining(`Loaded ${Object.keys(CurrentTestSessionManager._ontologies).length} ontologies`));
    });
  });

  describe('Session Management', () => {
    test('create should generate a new session and save it', () => {
      const mockUuid = 'test-session-id';
      mockUuidV4.mockReturnValue(mockUuid);
      const session = SessionManager.create();
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        `${MOCK_SESSION_STORAGE_PATH}/${mockUuid}.json`,
        JSON.stringify(session, null, 2)
      );
      expect(session.sessionId).toBe(mockUuid);
      expect(session.createdAt).toBeDefined();
      expect(session.facts).toEqual([]);
      expect(session.factCount).toBe(0);
      expect(SessionManager._sessions[mockUuid]).toBe(session);
      expect(mockLoggerInfo).toHaveBeenCalledWith(`Created new session: ${mockUuid}`);
    });

    test('_saveSession should throw ApiError if fs.writeFileSync fails', () => {
      const mockUuid = 'save-fail-id';
      mockUuidV4.mockReturnValue(mockUuid);
      mockFsWriteFileSync.mockImplementation(() => { throw new Error('Disk full'); });
      expect(() => SessionManager.create()).toThrow(expect.objectContaining({
          name: 'ApiError', // Check name
          statusCode: 500,
          message: `Failed to save session ${mockUuid}: Disk full (FS Code: undefined)`,
          errorCode: 'SESSION_SAVE_OPERATION_FAILED',
      }));
    });

    test('get should retrieve an existing session from memory', () => {
      const mockSession = { sessionId: 'existing-id', facts: ['fact1.'] };
      SessionManager._sessions['existing-id'] = mockSession;
      const session = SessionManager.get('existing-id');
      expect(session).toBe(mockSession);
      expect(mockFsReadFileSync).not.toHaveBeenCalled();
    });

    test('get should load a session from file if not in memory', () => {
      const mockSessionData = { sessionId: 'file-id', facts: ['fact2.'] };
      mockFsExistsSync.mockImplementation(p => p === `${MOCK_SESSION_STORAGE_PATH}/file-id.json`);
      mockFsReadFileSync.mockReturnValue(JSON.stringify(mockSessionData));
      const session = SessionManager.get('file-id');
      expect(session).toEqual(mockSessionData);
      expect(SessionManager._sessions['file-id']).toEqual(mockSessionData);
      expect(mockFsReadFileSync).toHaveBeenCalledWith(`${MOCK_SESSION_STORAGE_PATH}/file-id.json`, 'utf8');
    });

    test('get should throw ApiError if session not found', () => {
      mockFsExistsSync.mockReturnValue(false);
      expect(() => SessionManager.get('non-existent-id')).toThrow(expect.objectContaining({
          name: 'ApiError',
          statusCode: 404, message: "Session with ID 'non-existent-id' not found.", errorCode: 'SESSION_NOT_FOUND',
      }));
    });

    test('delete should remove session from memory and delete its file', () => {
      const mockSession = { sessionId: 'delete-id', facts: [] };
      SessionManager._sessions['delete-id'] = mockSession;
      mockFsExistsSync.mockReturnValue(true);
      SessionManager.delete('delete-id');
      expect(SessionManager._sessions['delete-id']).toBeUndefined();
      expect(mockFsUnlinkSync).toHaveBeenCalledWith(`${MOCK_SESSION_STORAGE_PATH}/delete-id.json`);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Terminated session: delete-id');
    });

    test('delete should not throw if session file does not exist', () => {
      const mockSession = { sessionId: 'delete-no-file-id', facts: [] };
      SessionManager._sessions['delete-no-file-id'] = mockSession;
      mockFsExistsSync.mockReturnValue(false);
      expect(() => SessionManager.delete('delete-no-file-id')).not.toThrow();
      expect(mockFsUnlinkSync).not.toHaveBeenCalled();
    });

    test('addFacts should add new facts to a session and save it', () => {
      const mockSession = { sessionId: 'add-facts-id', facts: ['initial_fact.'], factCount: 1 };
      SessionManager._sessions['add-facts-id'] = mockSession;
      mockFsWriteFileSync.mockImplementation(() => {});
      const newFacts = ['new_fact_1.', 'new_fact_2.'];
      SessionManager.addFacts('add-facts-id', newFacts);
      expect(mockSession.facts).toEqual(['initial_fact.', 'new_fact_1.', 'new_fact_2.']);
      expect(mockSession.factCount).toBe(3);
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(
        `${MOCK_SESSION_STORAGE_PATH}/add-facts-id.json`,
        JSON.stringify(mockSession, null, 2)
      );
      expect(mockLoggerInfo).toHaveBeenCalledWith('Session add-facts-id: Asserted 2 new facts.');
    });
  });

  describe('Ontology Management', () => {
    test('addOntology should add a new ontology and save it', () => {
      const ontologyName = 'test_ontology';
      const rules = `rule1.\nrule2.`;
      mockFsWriteFileSync.mockImplementation(() => {});
      const result = SessionManager.addOntology(ontologyName, rules);
      expect(result).toEqual({ name: ontologyName, rules });
      expect(SessionManager._ontologies[ontologyName]).toBe(rules);
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(`${MOCK_ONTOLOGY_STORAGE_PATH}/${ontologyName}.pl`, rules);
      expect(mockLoggerInfo).toHaveBeenCalledWith(`Added new ontology: ${ontologyName}`);
    });

    test('addOntology should throw ApiError if ontology already exists', () => {
      SessionManager._ontologies['existing_ontology'] = 'some_rules.';
      expect(() => SessionManager.addOntology('existing_ontology', 'new_rules.')).toThrow(
        expect.objectContaining({ name: 'ApiError', statusCode: 409, message: "Ontology with name 'existing_ontology' already exists.", errorCode: 'ONTOLOGY_ALREADY_EXISTS' })
      );
    });

    test('updateOntology should update an existing ontology and save it', () => {
      const ontologyName = 'update_ontology';
      SessionManager._ontologies[ontologyName] = 'old_rules.';
      mockFsWriteFileSync.mockImplementation(() => {});
      const newRules = `updated_rule1.\nupdated_rule2.`;
      const result = SessionManager.updateOntology(ontologyName, newRules);
      expect(result).toEqual({ name: ontologyName, rules: newRules });
      expect(SessionManager._ontologies[ontologyName]).toBe(newRules);
      expect(mockFsWriteFileSync).toHaveBeenCalledWith(`${MOCK_ONTOLOGY_STORAGE_PATH}/${ontologyName}.pl`, newRules);
      expect(mockLoggerInfo).toHaveBeenCalledWith(`Updated ontology: ${ontologyName}`);
    });

    test('updateOntology should throw ApiError if ontology not found', () => {
      delete SessionManager._ontologies['non_existent_ontology'];
      mockFsExistsSync.mockReturnValue(false);
      expect(() => SessionManager.updateOntology('non_existent_ontology', 'rules.')).toThrow(
        expect.objectContaining({ name: 'ApiError', statusCode: 404, message: "Ontology with name 'non_existent_ontology' not found.", errorCode: 'ONTOLOGY_NOT_FOUND' })
      );
    });

    test('getOntologies should return all loaded ontologies', () => {
      SessionManager._ontologies = { onto1: 'rules1.', onto2: 'rules2.' };
      const ontologies = SessionManager.getOntologies();
      expect(ontologies).toEqual([{ name: 'onto1', rules: 'rules1.' }, { name: 'onto2', rules: 'rules2.' }]);
    });

    test('getOntology should return a specific ontology', () => {
      SessionManager._ontologies['specific_onto'] = 'specific_rules.';
      const ontology = SessionManager.getOntology('specific_onto');
      expect(ontology).toEqual({ name: 'specific_onto', rules: 'specific_rules.' });
    });

    test('getOntology should throw ApiError if ontology not found', () => {
      delete SessionManager._ontologies['non_existent_onto'];
      mockFsExistsSync.mockImplementation(p => p !== `${MOCK_ONTOLOGY_STORAGE_PATH}/non_existent_onto.pl`);
      expect(() => SessionManager.getOntology('non_existent_onto')).toThrow(
        expect.objectContaining({ name: 'ApiError', statusCode: 404, message: "Ontology with name 'non_existent_onto' not found.", errorCode: 'ONTOLOGY_NOT_FOUND' })
      );
    });

    test('deleteOntology should remove ontology from memory and delete its file', () => {
      SessionManager._ontologies['delete_onto'] = 'rules_to_delete.';
      mockFsExistsSync.mockReturnValue(true);
      const result = SessionManager.deleteOntology('delete_onto');
      expect(result).toEqual({ message: 'Ontology delete_onto deleted.' });
      expect(SessionManager._ontologies['delete_onto']).toBeUndefined();
      expect(mockFsUnlinkSync).toHaveBeenCalledWith(`${MOCK_ONTOLOGY_STORAGE_PATH}/delete_onto.pl`);
      expect(mockLoggerInfo).toHaveBeenCalledWith('Deleted ontology: delete_onto');
    });

    test('deleteOntology should not throw if ontology file does not exist', () => {
      SessionManager._ontologies['delete_no_file_onto'] = 'rules.';
      mockFsExistsSync.mockReturnValue(false);
      expect(() => SessionManager.deleteOntology('delete_no_file_onto')).not.toThrow();
      expect(mockFsUnlinkSync).not.toHaveBeenCalled();
    });
  });

  describe('Fact and Ontology Combination', () => {
    test('getFactsWithOntology should combine session facts and loaded ontologies', () => {
      const mockSession = { sessionId: 'combine-id', facts: ['session_fact_1.', 'session_fact_2.'] };
      SessionManager._sessions['combine-id'] = mockSession;
      SessionManager._ontologies = {
        family: `parent(X,Y).\nchild(Y,X) :- parent(X,Y).`,
        animals: `cat(whiskers).\ndog(buddy).`,
      };
      const combinedFacts = SessionManager.getFactsWithOntology('combine-id');
      expect(combinedFacts).toEqual([
        'session_fact_1.', 'session_fact_2.',
        'parent(X,Y).', 'child(Y,X) :- parent(X,Y).',
        'cat(whiskers).', 'dog(buddy).',
      ]);
    });

    test('getFactsWithOntology should prioritize additionalOntology if provided', () => {
      const mockSession = { sessionId: 'combine-id-2', facts: ['session_fact_A.'] };
      SessionManager._sessions['combine-id-2'] = mockSession;
      SessionManager._ontologies = { family: 'parent(X,Y).' };
      const additionalOntology = `% This is a comment\nnew_rule(X).`;
      const combinedFacts = SessionManager.getFactsWithOntology('combine-id-2', additionalOntology);
      expect(combinedFacts).toEqual(['session_fact_A.', 'new_rule(X).']);
    });

    test('getNonSessionOntologyFacts should return only ontology facts not in session', () => {
      const mockSession = { sessionId: 'non-session-id', facts: ['common_fact.'] };
      SessionManager._sessions['non-session-id'] = mockSession;
      SessionManager._ontologies = { test_onto: `common_fact.\nunique_onto_fact.` };
      const nonSessionFacts = SessionManager.getNonSessionOntologyFacts('non-session-id');
      expect(nonSessionFacts).toEqual(['unique_onto_fact.']);
    });
  });
});
