const axios = require('axios');
const { spawn } = require('child_process');
const config = require('./config'); // To get server URL and port
const logger = require('./logger'); // Using the same logger for consistency

const API_BASE_URL = `http://${config.server.host}:${config.server.port}`;

/**
 * Checks if the MCR server is running and starts it if not.
 * @returns {Promise<boolean>} True if the server is running or started successfully, false otherwise.
 */
async function checkAndStartServer() {
  const healthCheckUrl = `${API_BASE_URL}/api/v1/health`;

  try {
    // Try to ping the server
    await axios.get(healthCheckUrl);
    logger.info('MCR server is already running.');
    console.log('✅ MCR server is already running.');
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
      logger.warn('MCR server not found or not responding. Attempting to start it...');
      console.log('ℹ️ MCR server not found or not responding. Attempting to start it...');

      const serverProcess = spawn('node', ['mcr.js'], {
        detached: true, // Allows the parent process to exit independently of the child
        stdio: 'ignore', // 'ignore' or 'pipe' to a log file if desired
      });

      serverProcess.on('error', (err) => {
        logger.error('Failed to start MCR server process:', err);
        console.error('❌ Failed to start MCR server process:', err.message);
      });

      serverProcess.unref(); // Allow parent to exit independently

      // Wait for the server to start
      let attempts = 0;
      const maxAttempts = 15; // Max attempts to check server status (e.g., 15 * 2s = 30s)
      const retryDelay = 2000; // 2 seconds

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        attempts++;
        logger.info(`Attempting to connect to server (attempt ${attempts}/${maxAttempts})...`);
        try {
          await axios.get(healthCheckUrl);
          logger.info('MCR server started successfully.');
          console.log('✅ MCR server started successfully.');
          return true;
        } catch (e) {
          if (attempts >= maxAttempts) {
            logger.error('MCR server failed to start within the expected time.');
            console.error('❌ MCR server failed to start after multiple attempts.');
            return false;
          }
          // Continue waiting
        }
      }
    } else {
      // Other errors (network issues, etc.)
      logger.error('Error checking server status:', error.message);
      console.error('❌ Error checking server status:', error.message);
      return false;
    }
  }
  return false; // Should not be reached if logic is correct
}

module.exports = { checkAndStartServer };
