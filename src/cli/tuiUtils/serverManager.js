// src/cli/tuiUtils/serverManager.js
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const config = require('../../config'); // Use new config directly
const logger = require('../../logger'); // Use main logger

async function isServerAliveAsync(url, retries = 5, delayTime = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url, { timeout: 500 });
      return true;
    } catch {
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayTime));
      }
    }
  }
  return false;
}

// programOpts is passed but not used in old version, keeping signature for now
async function startMcrServerAsync(_programOpts) {
  logger.info('🚀 Attempting to start the MCR server automatically for TUI...');

  // __dirname here will be src/cli/tuiUtils
  // Path to new cli.js in project root: tuiUtils -> cli -> src -> project_root
  const cliScriptPath = path.resolve(__dirname, '../../../cli.js');

  let serverStdErr = '';
  const serverInstance = spawn('node', [cliScriptPath, 'start-server'], {
    detached: true, // Allows TUI to exit independently of server
    stdio: ['ignore', 'ignore', 'pipe'], // 'ignore' stdin, stdout; 'pipe' stderr
  });

  serverInstance.stderr.on('data', (data) => {
    serverStdErr += data.toString();
    // Optionally log stderr in real-time for debugging if needed
    // logger.debug(`MCR Server (spawned for TUI) stderr: ${data.toString().trim()}`);
  });

  return new Promise((resolve, reject) => {
    serverInstance.on('error', (err) => {
      logger.error('Failed to start MCR server process for TUI:', {
        error: err,
        stderr: serverStdErr,
      });
      reject(err);
    });

    serverInstance.on('exit', (code, signal) => {
      // Log only if exit was unexpected (not a clean SIGTERM from server itself)
      if (code !== 0 && signal !== 'SIGTERM') {
        logger.error(
          `MCR server process (spawned for TUI) exited unexpectedly. Code: ${code}, Signal: ${signal}.`,
          { stderr: serverStdErr }
        );
        // Don't reject here as the process might have exited after becoming healthy,
        // or health check might still be pending. The health check is the decider.
      }
    });

    // serverInstance.unref(); // This allows the parent (TUI) to exit without waiting for the child (server)

    const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`; // Root endpoint for status

    // Increased retries and delay for server to start
    isServerAliveAsync(healthCheckUrl, 15, 700)
      .then((alive) => {
        if (alive) {
          logger.info(
            `MCR server (spawned for TUI) is alive at ${healthCheckUrl}.`
          );
          resolve(serverInstance); // Resolve with the server process instance
        } else {
          logger.error(
            'MCR server (spawned for TUI) failed to start or become healthy.',
            { stderr: serverStdErr }
          );
          reject(
            new Error(
              'Server failed to start or become healthy. Check server logs.'
            )
          );
        }
      })
      .catch((err) => {
        logger.error('Error during server health check for TUI:', {
          error: err,
          stderr: serverStdErr,
        });
        reject(err);
      });
  });
}

module.exports = {
  isServerAliveAsync,
  startMcrServerAsync,
};
