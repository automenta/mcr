// src/strategyManager.js
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const config = require('./config'); // To get the default strategy

const STRATEGIES_DIR = path.join(__dirname, 'translationStrategies');

class StrategyManager {
  constructor() {
    this.strategies = new Map();
    this.loadStrategies();
  }

  loadStrategies() {
    logger.info('[StrategyManager] Loading translation strategies...');
    try {
      const files = fs.readdirSync(STRATEGIES_DIR);
      files.forEach((file) => {
        // Skip base classes explicitly by name, and ensure it's a strategy file
        if (file.endsWith('Strategy.js') && file !== 'BaseSIRStrategy.js') {
          const strategyPath = path.join(STRATEGIES_DIR, file);
          try {
            const StrategyClass = require(strategyPath);
            if (typeof StrategyClass === 'function' && typeof StrategyClass.prototype.getName === 'function') {
              const instance = new StrategyClass();
              const strategyName = instance.getName();
              if (strategyName) {
                this.strategies.set(strategyName, instance);
                logger.info(`[StrategyManager] Loaded strategy: ${strategyName} from ${file}`);
              } else {
                logger.warn(`[StrategyManager] Strategy from ${file} does not have a valid name.`);
              }
            } else {
              logger.warn(`[StrategyManager] File ${file} does not export a valid strategy class.`);
            }
          } catch (error) {
            logger.error(`[StrategyManager] Error loading strategy from ${file}: ${error.message}`, { stack: error.stack });
          }
        }
      });
    } catch (error) {
      logger.error(`[StrategyManager] Error reading strategies directory ${STRATEGIES_DIR}: ${error.message}`, { stack: error.stack });
    }
    logger.info(`[StrategyManager] Total strategies loaded: ${this.strategies.size}`);
  }

  getStrategy(name) {
    if (!name) {
      logger.warn('[StrategyManager] Attempted to get strategy with no name, returning default strategy.');
      return this.getDefaultStrategy();
    }
    const strategy = this.strategies.get(name);
    if (!strategy) {
      logger.warn(`[StrategyManager] Strategy "${name}" not found. Returning default strategy.`);
      return this.getDefaultStrategy();
    }
    logger.debug(`[StrategyManager] Retrieved strategy: ${name}`);
    return strategy;
  }

  getDefaultStrategy() {
    const defaultStrategyName = config.translationStrategy; // Corrected path
    logger.debug(`[StrategyManager] Default strategy name from config: ${defaultStrategyName}`);
    const defaultStrategy = this.strategies.get(defaultStrategyName);
    if (!defaultStrategy) {
      // Fallback if default is not found (e.g. misconfiguration)
      logger.error(`[StrategyManager] Default strategy "${defaultStrategyName}" not found! Falling back to the first available strategy.`);
      if (this.strategies.size > 0) {
        const fallbackStrategy = this.strategies.values().next().value;
        logger.warn(`[StrategyManager] Using fallback strategy: ${fallbackStrategy.getName()}`);
        return fallbackStrategy;
      }
      logger.error('[StrategyManager] No strategies loaded. Cannot provide a default or fallback strategy.');
      throw new Error('No translation strategies available.');
    }
    logger.debug(`[StrategyManager] Retrieved default strategy: ${defaultStrategy.getName()}`);
    return defaultStrategy;
  }

  getAvailableStrategies() {
    return Array.from(this.strategies.keys());
  }
}

// Singleton instance
const strategyManagerInstance = new StrategyManager();
module.exports = strategyManagerInstance;
