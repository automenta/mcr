// new/src/api/strategyHandlers.js
const mcrService = require('../mcrService');
const { ApiError } = require('../errors');
const logger = require('../logger');

async function listStrategiesHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter listStrategiesHandler`);
  try {
    const strategies = mcrService.getAvailableStrategies(); // This should be synchronous from strategyManager via mcrService
    logger.info(
      `[API][${correlationId}] Successfully listed available strategies. Count: ${strategies.length}`
    );
    res.status(200).json({ strategies });
  } catch (error) {
    logger.error(`[API][${correlationId}] Error listing strategies:`, {
      error: error.stack,
    });
    next(new ApiError(500, 'Failed to list strategies.'));
  }
}

async function setStrategyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { strategyName } = req.body;
  logger.info(
    `[API][${correlationId}] Enter setStrategyHandler. StrategyName: ${strategyName}`
  );

  if (
    !strategyName ||
    typeof strategyName !== 'string' ||
    strategyName.trim() === ''
  ) {
    logger.warn(
      `[API][${correlationId}] Invalid input for setStrategyHandler: "strategyName" is missing or invalid.`
    );
    return next(
      new ApiError(400, 'Invalid input: "strategyName" is required.')
    );
  }

  try {
    const success = mcrService.setTranslationStrategy(strategyName);
    if (success) {
      const currentStrategy = mcrService.getActiveStrategyName();
      logger.info(
        `[API][${correlationId}] Translation strategy successfully set to: ${currentStrategy}`
      );
      res.status(200).json({
        message: `Translation strategy set to ${currentStrategy}`,
        activeStrategy: currentStrategy,
      });
    } else {
      logger.warn(
        `[API][${correlationId}] Failed to set translation strategy to: ${strategyName}. It might be invalid or already active.`
      );
      // mcrService.setTranslationStrategy now returns false if strategy is unknown or already active (but logs info for latter)
      // It's better to check if it's simply not found vs already active.
      // For now, if it's not found, it's a 400. If found but already active, it's still a success.
      // The mcrService.setTranslationStrategy was updated to handle this.
      // If it returns false, it implies the strategy was not found.
      next(
        new ApiError(
          400,
          `Failed to set translation strategy. Unknown strategy: ${strategyName}.`,
          'STRATEGY_NOT_FOUND'
        )
      );
    }
  } catch (error) {
    logger.error(
      `[API][${correlationId}] Error setting translation strategy:`,
      { error: error.stack }
    );
    next(
      new ApiError(500, `Failed to set translation strategy: ${error.message}`)
    );
  }
}

async function getActiveStrategyHandler(req, res, next) {
  const correlationId = req.correlationId;
  logger.info(`[API][${correlationId}] Enter getActiveStrategyHandler`);
  try {
    const activeStrategy = mcrService.getActiveStrategyName();
    logger.info(
      `[API][${correlationId}] Successfully retrieved active strategy: ${activeStrategy}`
    );
    res.status(200).json({ activeStrategy });
  } catch (error) {
    logger.error(`[API][${correlationId}] Error retrieving active strategy:`, {
      error: error.stack,
    });
    next(new ApiError(500, 'Failed to retrieve active strategy.'));
  }
}

module.exports = {
  listStrategiesHandler,
  setStrategyHandler,
  getActiveStrategyHandler,
};
