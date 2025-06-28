const SessionManager = require('../src/sessionManager');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../src/logger');
const ApiError = require('../src/errors');
const ConfigManager = require('../src/config');

// Mock dependencies
jest.mock('uuid');
jest.mock('fs');
jest.mock('path');
jest.mock('../src/logger');
jest.mock('../src/errors');
jest.mock('../src/config');

describe('SessionManager', () => {
    const MOCK_SESSION_STORAGE_PATH = '/mock/session/storage';
    const MOCK_ONTOLOGY_STORAGE_PATH = '/mock/ontology/storage';

    beforeAll(() => {
        // Mock ConfigManager to return consistent paths
        ConfigManager.load.mockReturnValue({
            session: { storagePath: MOCK_SESSION_STORAGE_PATH },
            ontology: { storagePath: MOCK_ONTOLOGY_STORAGE_PATH }
        });

        // Mock path.resolve and path.join to return predictable paths
        path.resolve.mockImplementation((p) => p);
        path.join.mockImplementation((...args) => args.join('/'));

        // Ensure directories are "created" for tests
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockReturnValue(undefined);

        // Clear all session and ontology data before each test suite
        SessionManager._sessions = {};
        SessionManager._ontologies = {};
    });

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Re-mock existsSync for specific scenarios if needed, default to true
        fs.existsSync.mockReturnValue(true);
        // Reset internal state of SessionManager for isolation
        SessionManager._sessions = {};
        SessionManager._ontologies = {};
    });

    describe('Initialization', () => {
        test('should create session and ontology storage directories if they do not exist', () => {
            fs.existsSync.mockReturnValueOnce(false).mockReturnValueOnce(false); // First call for session, second for ontology
            require('../src/sessionManager'); // Re-require to trigger initialization logic
            expect(fs.mkdirSync).toHaveBeenCalledWith(MOCK_SESSION_STORAGE_PATH, { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith(MOCK_ONTOLOGY_STORAGE_PATH, { recursive: true });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Created session storage directory'));
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Created ontology storage directory'));
        });

        test('should not create directories if they already exist', () => {
            require('../src/sessionManager'); // Re-require to trigger initialization logic
            expect(fs.mkdirSync).not.toHaveBeenCalled();
        });

        test('should load all ontologies on initialization', () => {
            fs.readdirSync.mockReturnValue(['family.pl', 'another.pl']);
            fs.readFileSync.mockReturnValueOnce('parent(X,Y).').mockReturnValueOnce('rule(A,B).');
            
            // Re-require to trigger _loadAllOntologies
            jest.resetModules(); // Clear module cache
            const NewSessionManager = require('../src/sessionManager');
            
            expect(fs.readdirSync).toHaveBeenCalledWith(MOCK_ONTOLOGY_STORAGE_PATH);
            expect(fs.readFileSync).toHaveBeenCalledWith('/mock/ontology/storage/family.pl', 'utf8');
            expect(fs.readFileSync).toHaveBeenCalledWith('/mock/ontology/storage/another.pl', 'utf8');
            expect(NewSessionManager._ontologies).toEqual({
                family: 'parent(X,Y).',
                another: 'rule(A,B).'
            });
            expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Loaded 2 ontologies'));
        });
    });

    describe('Session Management', () => {
        test('create should generate a new session and save it', () => {
            const mockUuid = 'test-session-id';
            uuidv4.mockReturnValue(mockUuid);

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
            expect(logger.info).toHaveBeenCalledWith(`Created new session: ${mockUuid}`);
        });

        test('get should retrieve an existing session from memory', () => {
            const mockSession = { sessionId: 'existing-id', facts: ['fact1.'] };
            SessionManager._sessions['existing-id'] = mockSession;

            const session = SessionManager.get('existing-id');
            expect(session).toBe(mockSession);
            expect(fs.readFileSync).not.toHaveBeenCalled(); // Should not load from file if in memory
        });

        test('get should load a session from file if not in memory', () => {
            const mockSession = { sessionId: 'file-id', facts: ['fact2.'] };
            fs.readFileSync.mockReturnValue(JSON.stringify(mockSession));

            const session = SessionManager.get('file-id');
            expect(session).toEqual(mockSession);
            expect(SessionManager._sessions['file-id']).toEqual(mockSession); // Should be added to memory
            expect(fs.readFileSync).toHaveBeenCalledWith(`${MOCK_SESSION_STORAGE_PATH}/file-id.json`, 'utf8');
        });

        test('get should throw ApiError if session not found', () => {
            fs.existsSync.mockReturnValue(false); // Ensure file doesn't exist
            ApiError.mockImplementation((status, message) => ({ status, message })); // Mock ApiError constructor

            expect(() => SessionManager.get('non-existent-id')).toThrow(ApiError);
            expect(() => SessionManager.get('non-existent-id')).toThrow('Session with ID 'non-existent-id' not found.');
            expect(ApiError).toHaveBeenCalledWith(404, 'Session with ID 'non-existent-id' not found.');
        });

        test('delete should remove session from memory and delete its file', () => {
            const mockSession = { sessionId: 'delete-id', facts: [] };
            SessionManager._sessions['delete-id'] = mockSession;
            fs.existsSync.mockReturnValue(true); // Simulate file exists

            SessionManager.delete('delete-id');

            expect(SessionManager._sessions['delete-id']).toBeUndefined();
            expect(fs.unlinkSync).toHaveBeenCalledWith(`${MOCK_SESSION_STORAGE_PATH}/delete-id.json`);
            expect(logger.info).toHaveBeenCalledWith('Terminated session: delete-id');
        });

        test('delete should not throw if session file does not exist', () => {
            const mockSession = { sessionId: 'delete-no-file-id', facts: [] };
            SessionManager._sessions['delete-no-file-id'] = mockSession;
            fs.existsSync.mockReturnValue(false); // Simulate file does not exist

            expect(() => SessionManager.delete('delete-no-file-id')).not.toThrow();
            expect(fs.unlinkSync).not.toHaveBeenCalled();
        });

        test('addFacts should add new facts to a session and save it', () => {
            const mockSession = { sessionId: 'add-facts-id', facts: ['initial_fact.'] };
            SessionManager._sessions['add-facts-id'] = mockSession;

            const newFacts = ['new_fact_1.', 'new_fact_2.'];
            SessionManager.addFacts('add-facts-id', newFacts);

            expect(mockSession.facts).toEqual(['initial_fact.', 'new_fact_1.', 'new_fact_2.']);
            expect(mockSession.factCount).toBe(3);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                `${MOCK_SESSION_STORAGE_PATH}/add-facts-id.json`,
                JSON.stringify(mockSession, null, 2)
            );
            expect(logger.info).toHaveBeenCalledWith('Session add-facts-id: Asserted 2 new facts.');
        });
    });

    describe('Ontology Management', () => {
        test('addOntology should add a new ontology and save it', () => {
            const ontologyName = 'test_ontology';
            const rules = 'rule1.
rule2.';

            const result = SessionManager.addOntology(ontologyName, rules);

            expect(result).toEqual({ name: ontologyName, rules });
            expect(SessionManager._ontologies[ontologyName]).toBe(rules);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                `${MOCK_ONTOLOGY_STORAGE_PATH}/${ontologyName}.pl`,
                rules
            );
            expect(logger.info).toHaveBeenCalledWith(`Added new ontology: ${ontologyName}`);
        });

        test('addOntology should throw ApiError if ontology already exists', () => {
            SessionManager._ontologies['existing_ontology'] = 'some_rules.';
            ApiError.mockImplementation((status, message) => ({ status, message }));

            expect(() => SessionManager.addOntology('existing_ontology', 'new_rules.')).toThrow(ApiError);
            expect(() => SessionManager.addOntology('existing_ontology', 'new_rules.')).toThrow('Ontology with name 'existing_ontology' already exists.');
            expect(ApiError).toHaveBeenCalledWith(409, 'Ontology with name 'existing_ontology' already exists.');
        });

        test('updateOntology should update an existing ontology and save it', () => {
            const ontologyName = 'update_ontology';
            SessionManager._ontologies[ontologyName] = 'old_rules.';
            const newRules = 'updated_rule1.
updated_rule2.';

            const result = SessionManager.updateOntology(ontologyName, newRules);

            expect(result).toEqual({ name: ontologyName, rules: newRules });
            expect(SessionManager._ontologies[ontologyName]).toBe(newRules);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                `${MOCK_ONTOLOGY_STORAGE_PATH}/${ontologyName}.pl`,
                newRules
            );
            expect(logger.info).toHaveBeenCalledWith(`Updated ontology: ${ontologyName}`);
        });

        test('updateOntology should throw ApiError if ontology not found', () => {
            ApiError.mockImplementation((status, message) => ({ status, message }));

            expect(() => SessionManager.updateOntology('non_existent_ontology', 'rules.')).toThrow(ApiError);
            expect(() => SessionManager.updateOntology('non_existent_ontology', 'rules.')).toThrow('Ontology with name 'non_existent_ontology' not found.');
            expect(ApiError).toHaveBeenCalledWith(404, 'Ontology with name 'non_existent_ontology' not found.');
        });

        test('getOntologies should return all loaded ontologies', () => {
            SessionManager._ontologies = {
                'onto1': 'rules1.',
                'onto2': 'rules2.'
            };
            const ontologies = SessionManager.getOntologies();
            expect(ontologies).toEqual([
                { name: 'onto1', rules: 'rules1.' },
                { name: 'onto2', rules: 'rules2.' }
            ]);
        });

        test('getOntology should return a specific ontology', () => {
            SessionManager._ontologies['specific_onto'] = 'specific_rules.';
            const ontology = SessionManager.getOntology('specific_onto');
            expect(ontology).toEqual({ name: 'specific_onto', rules: 'specific_rules.' });
        });

        test('getOntology should throw ApiError if ontology not found', () => {
            ApiError.mockImplementation((status, message) => ({ status, message }));
            expect(() => SessionManager.getOntology('non_existent_onto')).toThrow(ApiError);
            expect(() => SessionManager.getOntology('non_existent_onto')).toThrow('Ontology with name 'non_existent_onto' not found.');
            expect(ApiError).toHaveBeenCalledWith(404, 'Ontology with name 'non_existent_onto' not found.');
        });

        test('deleteOntology should remove ontology from memory and delete its file', () => {
            SessionManager._ontologies['delete_onto'] = 'rules_to_delete.';
            fs.existsSync.mockReturnValue(true);

            const result = SessionManager.deleteOntology('delete_onto');

            expect(result).toEqual({ message: 'Ontology delete_onto deleted.' });
            expect(SessionManager._ontologies['delete_onto']).toBeUndefined();
            expect(fs.unlinkSync).toHaveBeenCalledWith(`${MOCK_ONTOLOGY_STORAGE_PATH}/delete_onto.pl`);
            expect(logger.info).toHaveBeenCalledWith('Deleted ontology: delete_onto');
        });

        test('deleteOntology should not throw if ontology file does not exist', () => {
            SessionManager._ontologies['delete_no_file_onto'] = 'rules.';
            fs.existsSync.mockReturnValue(false);

            expect(() => SessionManager.deleteOntology('delete_no_file_onto')).not.toThrow();
            expect(fs.unlinkSync).not.toHaveBeenCalled();
        });
    });

    describe('Fact and Ontology Combination', () => {
        test('getFactsWithOntology should combine session facts and loaded ontologies', () => {
            const mockSession = { sessionId: 'combine-id', facts: ['session_fact_1.', 'session_fact_2.'] };
            SessionManager._sessions['combine-id'] = mockSession;
            SessionManager._ontologies = {
                'family': 'parent(X,Y).
child(Y,X) :- parent(X,Y).',
                'animals': 'cat(whiskers).
dog(buddy).'
            };

            const combinedFacts = SessionManager.getFactsWithOntology('combine-id');
            expect(combinedFacts).toEqual([
                'session_fact_1.',
                'session_fact_2.',
                'parent(X,Y).',
                'child(Y,X) :- parent(X,Y).',
                'cat(whiskers).',
                'dog(buddy).'
            ]);
        });

        test('getFactsWithOntology should prioritize additionalOntology if provided', () => {
            const mockSession = { sessionId: 'combine-id-2', facts: ['session_fact_A.'] };
            SessionManager._sessions['combine-id-2'] = mockSession;
            SessionManager._ontologies = {
                'family': 'parent(X,Y).'
            };
            const additionalOntology = '% This is a comment
new_rule(X).';

            const combinedFacts = SessionManager.getFactsWithOntology('combine-id-2', additionalOntology);
            expect(combinedFacts).toEqual([
                'session_fact_A.',
                'new_rule(X).'
            ]);
        });

        test('getNonSessionOntologyFacts should return only ontology facts not in session', () => {
            const mockSession = { sessionId: 'non-session-id', facts: ['common_fact.'] };
            SessionManager._sessions['non-session-id'] = mockSession;
            SessionManager._ontologies = {
                'test_onto': 'common_fact.
unique_onto_fact.'
            };

            const nonSessionFacts = SessionManager.getNonSessionOntologyFacts('non-session-id');
            expect(nonSessionFacts).toEqual(['unique_onto_fact.']);
        });
    });
});
