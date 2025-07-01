const SessionManager = require('../sessionManager');
const { validateNonEmptyString } = require('./handlerUtils');

const ontologyHandlers = {
  addOntology: (req, res, next) => {
    try {
      const { name, rules } = req.body;
      validateNonEmptyString(name, 'name', 'ONTOLOGY_ADD');
      validateNonEmptyString(rules, 'rules', 'ONTOLOGY_ADD');
      const newOntology = SessionManager.addOntology(name, rules);
      res.status(201).json(newOntology);
    } catch (err) {
      next(err);
    }
  },

  updateOntology: (req, res, next) => {
    try {
      const { name } = req.params;
      const { rules } = req.body;
      validateNonEmptyString(rules, 'rules', 'ONTOLOGY_UPDATE');
      const updatedOntology = SessionManager.updateOntology(name, rules);
      res.json(updatedOntology);
    } catch (err) {
      next(err);
    }
  },

  getOntologies: (req, res, next) => {
    try {
      res.json(SessionManager.getOntologies());
    } catch (err) {
      next(err);
    }
  },

  getOntology: (req, res, next) => {
    try {
      const ontology = SessionManager.getOntology(req.params.name);
      res.json(ontology);
    } catch (err) {
      next(err);
    }
  },

  deleteOntology: (req, res, next) => {
    try {
      const { name } = req.params;
      const result = SessionManager.deleteOntology(name);
      res.json({
        message: result.message || `Ontology ${name} deleted.`,
        ontologyName: name,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = ontologyHandlers;
