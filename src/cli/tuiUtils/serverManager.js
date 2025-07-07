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

// _programOpts was passed but not used.
async function startMcrServerAsync(/* _programOpts */) {
  logger.info('🚀 Attempting to start the MCR server automatically for TUI...');

  // __dirname here will be src/cli/tuiUtils
  // Path to new cli.js in project root: tuiUtils -> cli -> src -> project_root
  const cliScriptPath = path.resolve(__dirname, '../../../cli.js');

  let serverStdOut = '';
  let serverStdErr = '';
  const serverInstance = spawn('node', [cliScriptPath, 'start-server'], {
    detached: true, // Allows TUI to exit independently of server
    stdio: ['ignore', 'pipe', 'pipe'], // 'ignore' stdin; 'pipe' stdout, stderr
  });

  serverInstance.stdout.on('data', (data) => {
    const output = data.toString();
    serverStdOut += output;
    logger.debug(`MCR Server (spawned) stdout: ${output.trim()}`);
  });

  serverInstance.stderr.on('data', (data) => {
    const output = data.toString();
    serverStdErr += output;
    logger.error(`MCR Server (spawned) stderr: ${output.trim()}`); // Log stderr more prominently
  });

  return new Promise((resolve, reject) => {
    serverInstance.on('error', (err) => {
      logger.error('Failed to start MCR server process (on error event):', {
        error: err,
        stdout: serverStdOut,
        stderr: serverStdErr,
      });
      reject(err);
    });

    serverInstance.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM') {
        // Log only if exit was unexpected
        logger.error(
          `MCR server process (spawned) exited unexpectedly. Code: ${code}, Signal: ${signal}.`,
          { stdout: serverStdOut, stderr: serverStdErr }
        );
        // Do not reject here solely based on exit, health check is the primary indicator
      } else {
        logger.info(
          `MCR server process (spawned) exited. Code: ${code}, Signal: ${signal}.`
        );
      }
    });

    // serverInstance.unref(); // Let's keep this commented to see if it affects behavior

    const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`;
    logger.debug(
      `[serverManager] Health check URL for spawned server: ${healthCheckUrl}`
    );

    // Reduced retries for faster feedback during debugging
    isServerAliveAsync(healthCheckUrl, 5, 500)
      .then((alive) => {
        if (alive) {
          logger.info(
            `[serverManager] MCR server (spawned) is alive at ${healthCheckUrl}.`
          );
          resolve(serverInstance);
        } else {
          logger.error(
            '[serverManager] MCR server (spawned) failed to start or become healthy after health checks.',
            { stdout: serverStdOut, stderr: serverStdErr }
          );
          reject(
            new Error(
              'Server failed to start or become healthy. Check server logs (stdout/stderr captured).'
            )
          );
        }
      })
      .catch((err) => {
        // This catch is for isServerAliveAsync errors
        logger.error('Error during server health check:', {
          error: err,
          stdout: serverStdOut,
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
