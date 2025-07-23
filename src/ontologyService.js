// src/ontologyService.js
const fs = require('fs').promises;
const path = require('path');
const logger = require('./util/logger');
const { ApiError } = require('./errors');
const PrologReasonerProvider = require('./reason/prologReasoner');

let ONTOLOGY_DIR = null;
let reasonerProvider = null;
// Define ontology extension as a constant for easier modification
const ONTOLOGY_FILE_EXTENSION = '.pl';

function configureOntologyService(options = {}) {
	if (options.ontologyDir) {
		ONTOLOGY_DIR = options.ontologyDir;
	}
	if (options.reasonerProvider) {
		reasonerProvider = options.reasonerProvider;
	} else {
		reasonerProvider = PrologReasonerProvider;
	}
}

/**
 * Ensures the ontology directory exists.
 */
async function ensureOntologyDirExists() {
	try {
		if (!ONTOLOGY_DIR) {
			throw new Error('Ontology directory not configured.');
		}
		await fs.mkdir(ONTOLOGY_DIR, { recursive: true });
	} catch (error) {
		logger.error(
			`[OntologyService] Failed to create ontology directory: ${ONTOLOGY_DIR}`,
			error
		);
		throw new ApiError(500, 'Failed to initialize ontology storage.');
	}
}

/**
 * Validates an ontology name.
 * For now, it just checks for empty or potentially unsafe names.
 * @param {string} name - The name of the ontology.
 */
function isValidOntologyName(name) {
	if (!name || typeof name !== 'string' || name.trim() === '') {
		return false;
	}
	// Prevent path traversal and invalid characters for filenames
	return /^[a-zA-Z0-9_-]+$/.test(name);
}

/**
 * Creates a new ontology.
 * @param {string} name - The name of the ontology (filename without extension).
 * @param {string} rulesString - The Prolog rules as a string.
 * @returns {Promise<{name: string, rules: string}>} The created ontology.
 */
async function createOntology(name, rulesString) {
	await ensureOntologyDirExists();
	if (!isValidOntologyName(name)) {
		throw new ApiError(
			400,
			'Invalid ontology name. Use alphanumeric characters, underscores, or hyphens.'
		);
	}
	if (typeof rulesString !== 'string') {
		throw new ApiError(400, 'Ontology rules must be a string.');
	}

	// Validate Prolog syntax before saving
	const validationResult = await reasonerProvider.validate(rulesString);
	if (!validationResult.isValid) {
		logger.warn(
			`[OntologyService] Validation failed for new ontology "${name}". Error: ${validationResult.error}`
		);
		throw new ApiError(
			400,
			`Invalid Prolog syntax in ontology rules: ${validationResult.error}`,
			'PROLOG_VALIDATION_FAILED',
			{ details: validationResult.error }
		);
	}

	const filePath = path.join(ONTOLOGY_DIR, `${name}${ONTOLOGY_EXTENSION}`);

	try {
		await fs.writeFile(filePath, rulesString, { flag: 'wx' }); // 'wx' fails if path exists
		logger.info(
			`[OntologyService] Created ontology: ${name} after validation.`
		);
		return { name, rules: rulesString };
	} catch (error) {
		if (error.code === 'EEXIST') {
			throw new ApiError(409, `Ontology '${name}' already exists.`);
		}
		logger.error(`[OntologyService] Error creating ontology '${name}':`, error);
		throw new ApiError(500, `Failed to create ontology '${name}'.`);
	}
}

/**
 * Retrieves an ontology by name.
 * @param {string} name - The name of the ontology.
 * @returns {Promise<{name: string, rules: string} | null>} The ontology, or null if not found.
 */
async function getOntology(name) {
	if (!isValidOntologyName(name)) {
		// While this might seem like a 400, for GET, if the name is invalid, it effectively won't be found.
		// Consistent with returning null for non-existent valid names.
		// However, API layer might choose to return 400 if name format is strictly enforced.
		logger.warn(
			`[OntologyService] Attempt to get ontology with invalid name format: ${name}`
		);
		return null;
	}
	const filePath = path.join(ONTOLOGY_DIR, `${name}${ONTOLOGY_EXTENSION}`);
	try {
		const rules = await fs.readFile(filePath, 'utf-8');
		logger.debug(`[OntologyService] Retrieved ontology: ${name}`);
		return { name, rules };
	} catch (error) {
		if (error.code === 'ENOENT') {
			logger.warn(`[OntologyService] Ontology not found: ${name}`);
			return null;
		}
		logger.error(
			`[OntologyService] Error retrieving ontology '${name}':`,
			error
		);
		throw new ApiError(500, `Failed to retrieve ontology '${name}'.`);
	}
}

/**
 * Lists all available ontologies.
 * @returns {Promise<Array<{name: string, rules?: string}>>} A list of ontologies (rules content optional here, can be fetched on demand).
 */
async function listOntologies(includeRules = false) {
	await ensureOntologyDirExists(); // Ensure dir exists before trying to read
	try {
		const files = await fs.readdir(ONTOLOGY_DIR);
		const ontologyFiles = files.filter(file =>
			file.endsWith(ONTOLOGY_EXTENSION)
		);
		const ontologies = await Promise.all(
			ontologyFiles.map(async file => {
				const name = path.basename(file, ONTOLOGY_EXTENSION);
				if (includeRules) {
					const content = await getOntology(name); // Reuse getOntology to get rules
					return { name, rules: content ? content.rules : '' }; // Handle case where getOntology might fail (should be rare if file exists)
				}
				return { name };
			})
		);
		logger.debug(
			`[OntologyService] Listed ontologies. Count: ${ontologies.length}`
		);
		return ontologies;
	} catch (error) {
		logger.error('[OntologyService] Error listing ontologies:', error);
		throw new ApiError(500, 'Failed to list ontologies.');
	}
}

/**
 * Updates an existing ontology.
 * @param {string} name - The name of the ontology to update.
 * @param {string} newRulesString - The new Prolog rules.
 * @returns {Promise<{name: string, rules: string}>} The updated ontology.
 */
async function updateOntology(name, newRulesString) {
	if (!isValidOntologyName(name)) {
		throw new ApiError(400, 'Invalid ontology name for update.');
	}
	if (typeof newRulesString !== 'string') {
		throw new ApiError(400, 'Ontology rules for update must be a string.');
	}

	// Validate Prolog syntax before saving
	const validationResult = await reasonerProvider.validate(newRulesString);
	if (!validationResult.isValid) {
		logger.warn(
			`[OntologyService] Validation failed for updating ontology "${name}". Error: ${validationResult.error}`
		);
		throw new ApiError(
			400,
			`Invalid Prolog syntax in updated ontology rules: ${validationResult.error}`,
			'PROLOG_VALIDATION_FAILED',
			{ details: validationResult.error }
		);
	}

	const filePath = path.join(ONTOLOGY_DIR, `${name}${ONTOLOGY_EXTENSION}`);
	try {
		// Check if file exists first to provide a 404 if it doesn't
		await fs.access(filePath); // Throws if doesn't exist
		await fs.writeFile(filePath, newRulesString, 'utf-8'); // Overwrite existing file
		logger.info(
			`[OntologyService] Updated ontology: ${name} after validation.`
		);
		return { name, rules: newRulesString };
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new ApiError(404, `Ontology '${name}' not found for update.`);
		}
		logger.error(`[OntologyService] Error updating ontology '${name}':`, error);
		throw new ApiError(500, `Failed to update ontology '${name}'.`);
	}
}

/**
 * Deletes an ontology.
 * @param {string} name - The name of the ontology to delete.
 * @returns {Promise<void>}
 */
async function deleteOntology(name) {
	if (!isValidOntologyName(name)) {
		throw new ApiError(400, 'Invalid ontology name for deletion.');
	}
	const filePath = path.join(ONTOLOGY_DIR, `${name}${ONTOLOGY_EXTENSION}`);
	try {
		await fs.unlink(filePath);
		logger.info(`[OntologyService] Deleted ontology: ${name}`);
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new ApiError(404, `Ontology '${name}' not found for deletion.`);
		}
		logger.error(`[OntologyService] Error deleting ontology '${name}':`, error);
		throw new ApiError(500, `Failed to delete ontology '${name}'.`);
	}
}

/**
 * Retrieves all ontology rules from all files and concatenates them into a single string.
 * @returns {Promise<string>} A single string containing all global ontology rules.
 */
async function getGlobalOntologyRulesAsString() {
	try {
		const ontologies = await listOntologies(true); // true to include rules
		if (!ontologies || ontologies.length === 0) {
			logger.info('[OntologyService] No global ontologies found to load.');
			return '';
		}
		const allRules = ontologies.map(ont => ont.rules).join('\n\n');
		logger.info(
			`[OntologyService] Loaded ${ontologies.length} global ontologies.`
		);
		return allRules;
	} catch (error) {
		logger.error(
			'[OntologyService] Failed to get global ontology rules as string:',
			error
		);
		// Depending on desired system behavior, either rethrow or return empty string
		// Returning empty allows the system to proceed without ontology rules.
		return '';
	}
}

module.exports = {
	createOntology,
	getOntology,
	listOntologies,
	updateOntology,
	deleteOntology,
	getGlobalOntologyRulesAsString,
	configureOntologyService,
	// For testing or other internal uses if needed:
	// _ONTOLOGY_DIR: ONTOLOGY_DIR,
	// _ONTOLOGY_EXTENSION: ONTOLOGY_EXTENSION
};
