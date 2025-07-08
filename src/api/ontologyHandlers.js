// new/src/api/ontologyHandlers.js
const ontologyService = require('../ontologyService');
const { ApiError } = require('../errors');
const logger = require('../logger');

async function createOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name, rules } = req.body;
  logger.info(
    `[API][${correlationId}] Enter createOntologyHandler. Name: ${name}, Rules length: ${rules?.length}`
  );

  if (!name || !rules) {
    // Basic validation, service might do more
    logger.warn(
      `[API][${correlationId}] Invalid input for createOntologyHandler: "name" or "rules" missing.`
    );
    return next(
      new ApiError(400, 'Missing "name" or "rules" in request body.')
    );
  }
  try {
    const ontology = await ontologyService.createOntology(name, rules);
    logger.info(
      `[API][${correlationId}] Ontology created successfully: ${name}`
    );
    res.status(201).json(ontology);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error creating ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to create ontology '${name}'.`));
  }
}

async function getOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name } = req.params;
  logger.info(
    `[API][${correlationId}] Enter getOntologyHandler for ontology: ${name}`
  );
  try {
    const ontology = await ontologyService.getOntology(name);
    if (ontology) {
      logger.info(
        `[API][${correlationId}] Successfully retrieved ontology: ${name}`
      );
      res.status(200).json(ontology);
    } else {
      logger.warn(
        `[API][${correlationId}] Ontology not found for getOntologyHandler: ${name}`
      );
      next(
        new ApiError(404, `Ontology '${name}' not found.`, 'ONTOLOGY_NOT_FOUND')
      );
    }
  } catch (error) {
    logger.error(`[API][${correlationId}] Error retrieving ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to retrieve ontology '${name}'.`));
  }
}

async function listOntologiesHandler(req, res, next) {
  const correlationId = req.correlationId;
  const includeRules = req.query.includeRules === 'true';
  logger.info(
    `[API][${correlationId}] Enter listOntologiesHandler. Include rules: ${includeRules}`
  );
  try {
    const ontologies = await ontologyService.listOntologies(includeRules);
    logger.info(
      `[API][${correlationId}] Successfully listed ontologies. Count: ${ontologies.length}`
    );
    res.status(200).json(ontologies);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error listing ontologies:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, 'Failed to list ontologies.'));
  }
}

async function updateOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name } = req.params;
  const { rules } = req.body;
  logger.info(
    `[API][${correlationId}] Enter updateOntologyHandler for ontology: ${name}. Rules length: ${rules?.length}`
  );

  if (!rules) {
    // Basic validation
    logger.warn(
      `[API][${correlationId}] Invalid input for updateOntologyHandler: "rules" missing.`
    );
    return next(
      new ApiError(400, 'Missing "rules" in request body for update.')
    );
  }
  try {
    const updatedOntology = await ontologyService.updateOntology(name, rules);
    logger.info(
      `[API][${correlationId}] Ontology updated successfully: ${name}`
    );
    res.status(200).json(updatedOntology);
  } catch (error) {
    logger.error(`[API][${correlationId}] Error updating ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to update ontology '${name}'.`));
  }
}

async function deleteOntologyHandler(req, res, next) {
  const correlationId = req.correlationId;
  const { name } = req.params;
  logger.info(
    `[API][${correlationId}] Enter deleteOntologyHandler for ontology: ${name}`
  );
  try {
    await ontologyService.deleteOntology(name);
    logger.info(
      `[API][${correlationId}] Ontology deleted successfully: ${name}`
    );
    res
      .status(200)
      .json({ message: `Ontology '${name}' deleted successfully.` });
  } catch (error) {
    logger.error(`[API][${correlationId}] Error deleting ontology ${name}:`, {
      error: error.stack,
    });
    if (error instanceof ApiError) return next(error);
    next(new ApiError(500, `Failed to delete ontology '${name}'.`));
  }
}

module.exports = {
  createOntologyHandler,
  getOntologyHandler,
  listOntologiesHandler,
  updateOntologyHandler,
  deleteOntologyHandler,
};
