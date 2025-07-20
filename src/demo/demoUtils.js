// Adapted from old/src/demo.js
import fs from 'fs';
import path from 'path';

/**
 * Reads file content safely for demos.
 * Instead of exiting, it uses the demoLogger to report errors.
 * @param {string} filePath - The path to the file.
 * @param {string} fileDescription - A description of the file type.
 * @param {function} logger - The logger function to report errors.
 * @returns {string|null} The content of the file, or null if an error occurs.
 */
export const readFileContentSafe = (
	filePath,
	fileDescription = 'File',
	logger
) => {
	try {
		const resolvedPath = path.resolve(filePath);
		if (!fs.existsSync(resolvedPath)) {
			if (logger) {
				logger.error(
					`${fileDescription} not found: ${resolvedPath}`,
					'Please ensure the file path is correct and the file exists at that location.'
				);
			}
			return null;
		}
		return fs.readFileSync(resolvedPath, 'utf8');
	} catch (error) {
		if (logger) {
			logger.error(
				`Error reading ${fileDescription} "${filePath}"`,
				error.message
			);
		}
		return null;
	}
};
