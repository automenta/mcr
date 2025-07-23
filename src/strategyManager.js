// src/strategyManager.js
const fs = require('fs');
const path = require('path');
const logger = require('./util/logger');
const { MCRError, ErrorCodes } = require('./errors');

// Define the new directory for JSON strategies relative to the project root
const STRATEGIES_DIR_JSON = path.resolve(__dirname, '..', 'strategies'); // Use resolve for clarity

/**
 * @class StrategyManager
 * Manages the loading and retrieval of translation strategies defined in JSON format.
 * Strategies are loaded from the `strategies/` directory at the project root.
 */
class StrategyManager {
	constructor(config) {
		this.config = config;
		this.strategies = new Map();
		this.loadStrategies();
	}

	/**
	 * Loads all strategy definitions from .json files in the STRATEGIES_DIR_JSON directory.
	 * Each valid JSON strategy file is parsed and stored in a map, keyed by its `id`.
	 */
	loadStrategies() {
		logger.info(
			`[StrategyManager] Loading translation strategies from JSON files in ${STRATEGIES_DIR_JSON}...`
		);
		this.strategies.clear(); // Clear any previously loaded strategies

		try {
			if (!fs.existsSync(STRATEGIES_DIR_JSON)) {
				logger.warn(
					`[StrategyManager] Strategies directory not found: ${STRATEGIES_DIR_JSON}. No strategies will be loaded.`
				);
				return;
			}

			const files = fs.readdirSync(STRATEGIES_DIR_JSON);
			files.forEach(file => {
				if (file.endsWith('.json')) {
					const strategyPath = path.join(STRATEGIES_DIR_JSON, file);
					try {
						const fileContent = fs.readFileSync(strategyPath, 'utf8');
						const strategyJson = JSON.parse(fileContent);

						if (strategyJson && strategyJson.id && strategyJson.name) {
							// Basic validation of the JSON structure (can be expanded)
							if (
								!Array.isArray(strategyJson.nodes) ||
								!Array.isArray(strategyJson.edges)
							) {
								logger.warn(
									`[StrategyManager] Strategy JSON from ${file} is missing 'nodes' or 'edges' array. Skipping.`
								);
								return;
							}
							this.strategies.set(strategyJson.id, strategyJson);
							logger.info(
								`[StrategyManager] Loaded strategy: "${strategyJson.name}" (ID: ${strategyJson.id}) from ${file}`
							);
						} else {
							logger.warn(
								`[StrategyManager] Strategy JSON from ${file} is missing 'id' or 'name'. Skipping.`
							);
						}
					} catch (error) {
						logger.error(
							`[StrategyManager] Error loading or parsing strategy from ${file}: ${error.message}`,
							{ stack: error.stack }
						);
					}
				}
			});
		} catch (error) {
			logger.error(
				`[StrategyManager] Error reading strategies directory ${STRATEGIES_DIR_JSON}: ${error.message}`,
				{ stack: error.stack }
			);
		}
		logger.info(
			`[StrategyManager] Total JSON strategies loaded: ${this.strategies.size}`
		);
	}

	/**
	 * Retrieves a strategy JSON object by its ID.
	 * @param {string} id - The ID of the strategy.
	 * @returns {object | undefined} The strategy JSON object, or undefined if not found.
	 */
	getStrategy(id) {
		if (!id) {
			logger.warn(
				'[StrategyManager] Attempted to get strategy with no ID, returning default strategy.'
			);
			return this.getDefaultStrategy();
		}
		const strategy = this.strategies.get(id);
		if (!strategy) {
			// Do not return default here, let the caller handle undefined if a specific ID was requested and not found.
			// Only getDefaultStrategy should fall back to defaults.
			logger.warn(`[StrategyManager] Strategy with ID "${id}" not found.`);
			return undefined;
		}
		logger.debug(
			`[StrategyManager] Retrieved strategy: ${strategy.name} (ID: ${id})`
		);
		return strategy;
	}

	getDefaultStrategy() {
		const defaultStrategyId = this.config.translationStrategy;
		logger.debug(
			`[StrategyManager] Default strategy ID from config: ${defaultStrategyId}`
		);

		let defaultStrategy = this.strategies.get(defaultStrategyId);

		if (!defaultStrategy) {
			logger.error(
				`[StrategyManager] Default strategy ID "${defaultStrategyId}" from config not found!`
			);
			if (this.strategies.size > 0) {
				// Fallback to the first loaded strategy if the configured default is not found
				const fallbackStrategyEntry = this.strategies.entries().next().value; // [id, strategyJson]
				if (fallbackStrategyEntry) {
					defaultStrategy = fallbackStrategyEntry[1];
					logger.warn(
						`[StrategyManager] Using fallback strategy: "${defaultStrategy.name}" (ID: ${defaultStrategy.id})`
					);
				}
			}
		}

		if (!defaultStrategy) {
			logger.error(
				'[StrategyManager] No strategies loaded or available to use as default. Cannot provide a default strategy.'
			);
			// This is a critical error, as the system cannot function without a strategy.
			throw new MCRError(
				ErrorCodes.NO_STRATEGY_AVAILABLE,
				'No translation strategies available. Ensure at least one JSON strategy is defined and loadable.'
			);
		}

		logger.debug(
			`[StrategyManager] Retrieved default strategy: "${defaultStrategy.name}" (ID: ${defaultStrategy.id})`
		);
		return defaultStrategy;
	}

	/**
	 * Returns an array of available strategy details (id and name).
	 * @returns {Array<{id: string, name: string}>}
	 */
	getAvailableStrategies() {
		return Array.from(this.strategies.values()).map(s => ({
			id: s.id,
			name: s.name,
		}));
	}

	/**
	 * Retrieves a strategy JSON object by its SHA256 hash.
	 * @param {string} hash - The SHA256 hash of the strategy JSON.
	 * @returns {object | undefined} The strategy JSON object, or undefined if not found.
	 */
	getStrategyByHash(hash) {
		if (!hash) {
			logger.warn('[StrategyManager] Attempted to get strategy with no hash.');
			return undefined;
		}
		const crypto = require('crypto');
		for (const strategyJson of this.strategies.values()) {
			try {
				const currentStrategyHash = crypto
					.createHash('sha256')
					.update(JSON.stringify(strategyJson))
					.digest('hex');
				if (currentStrategyHash === hash) {
					logger.debug(
						`[StrategyManager] Found strategy by hash ${hash}: ID ${strategyJson.id}`
					);
					return strategyJson;
				}
			} catch (error) {
				// Should not happen if strategyJson is valid, but good to be cautious
				logger.error(
					`[StrategyManager] Error hashing strategy ID ${strategyJson.id} while searching for hash ${hash}: ${error.message}`
				);
			}
		}
		logger.warn(
			`[StrategyManager] Strategy with hash "${hash}" not found among loaded strategies.`
		);
		return undefined;
	}
}

// Singleton instance
const strategyManagerInstance = new StrategyManager();
module.exports = strategyManagerInstance;
