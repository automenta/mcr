const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger'); // Assuming a logger utility exists

const DB_PATH = path.join(process.cwd(), 'performance_results.db');

let db = null;

/**
 * Initializes the database connection and creates the performance_results table if it doesn't exist.
 * @returns {Promise<sqlite3.Database>} A promise that resolves with the database instance.
 */
function initDb() {
  return new Promise((resolve, reject) => {
    if (db) {
      return resolve(db);
    }

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('Error connecting to SQLite database:', err.message);
        db = null; // Reset db instance on connection error
        return reject(err);
      }
      logger.info(`Connected to SQLite database at ${DB_PATH}`);

      const createTableSql = `
        CREATE TABLE IF NOT EXISTS performance_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          strategy_hash TEXT NOT NULL,
          llm_model_id TEXT,
          example_id TEXT NOT NULL,
          metrics TEXT,          -- JSON object
          cost TEXT,             -- JSON object
          latency_ms INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          raw_output TEXT
        );
      `;

      db.run(createTableSql, (err) => {
        if (err) {
          logger.error('Error creating performance_results table:', err.message);
          db.close((closeErr) => {
            if (closeErr) logger.error('Error closing DB after table creation failure:', closeErr.message);
            db = null; // Reset db instance
            reject(err);
          });
        } else {
          logger.info('performance_results table ensured to exist.');
          resolve(db);
        }
      });
    });
  });
}

/**
 * Inserts a performance result into the database.
 * @param {Object} resultData
 * @param {string} resultData.strategy_hash
 * @param {string} [resultData.llm_model_id]
 * @param {string} resultData.example_id
 * @param {Object} resultData.metrics - JSON object of metric scores
 * @param {Object} [resultData.cost] - JSON object of cost metrics
 * @param {number} resultData.latency_ms
 * @param {string} [resultData.raw_output]
 * @returns {Promise<number>} A promise that resolves with the ID of the inserted row.
 */
async function insertPerformanceResult(resultData) {
  const currentDb = await initDb(); // Ensure DB is initialized

  return new Promise((resolve, reject) => {
    const {
      strategy_hash,
      llm_model_id,
      example_id,
      metrics,
      cost,
      latency_ms,
      raw_output,
    } = resultData;

    const insertSql = `
      INSERT INTO performance_results
      (strategy_hash, llm_model_id, example_id, metrics, cost, latency_ms, raw_output, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'utc'))
    `;

    // Ensure JSON objects are stringified
    const metricsJson = JSON.stringify(metrics);
    const costJson = JSON.stringify(cost || {}); // Default to empty object if cost is undefined

    currentDb.run(insertSql, [
      strategy_hash,
      llm_model_id,
      example_id,
      metricsJson,
      costJson,
      latency_ms,
      raw_output
    ], function (err) { // Use function() to access this.lastID
      if (err) {
        logger.error('Error inserting performance result:', err.message);
        return reject(err);
      }
      logger.info(`Inserted performance result with ID: ${this.lastID}`);
      resolve(this.lastID);
    });
  });
}

/**
 * Closes the database connection.
 * @returns {Promise<void>}
 */
function closeDb() {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err) => {
        if (err) {
          logger.error('Error closing the database connection:', err.message);
          return reject(err);
        }
        logger.info('Database connection closed.');
        db = null;
        resolve();
      });
    } else {
      resolve(); // No connection to close
    }
  });
}

module.exports = {
  initDb,
  insertPerformanceResult,
  closeDb,
  // Expose DB_PATH for testing or other modules if needed
  DB_PATH
};
