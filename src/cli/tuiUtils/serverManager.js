// src/cli/tuiUtils/serverManager.js
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const ConfigManager = require('../../config'); // path relative to this new file

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

async function startMcrServerAsync(_programOpts) {
  // eslint-disable-next-line no-console
  console.log('Starting MCR server (from tuiUtils/serverManager.js)...');

  // __dirname here will be src/cli/tuiUtils
  const mcrScriptPath = path.resolve(__dirname, '../../../mcr.js'); // Corrected path: tuiUtils -> cli -> src -> project_root
  let serverStdErr = '';
  const serverInstance = spawn('node', [mcrScriptPath], {
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  serverInstance.stderr.on('data', (data) => {
    serverStdErr += data.toString();
  });

  return new Promise((resolve, reject) => {
    serverInstance.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to start MCR server process:', err);
      // eslint-disable-next-line no-console
      console.error('MCR Server stderr:', serverStdErr);
      reject(err);
    });

    serverInstance.on('exit', (code, signal) => {
      // Enhanced logging for debugging server spawn issues
      // eslint-disable-next-line no-console
      console.error(`[serverManagerDebug] MCR server process exited. Code: ${code}, Signal: ${signal}. Stderr collected so far: ${serverStdErr}`);
      if (code !== 0 && !(code === null && signal === 'SIGTERM')) { // SIGTERM can be a graceful shutdown
        const errorMessage = `MCR server process exited abnormally. Code: ${code}, Signal: ${signal}. Stderr: ${serverStdErr}`;
        // eslint-disable-next-line no-console
        console.error(errorMessage);
      }
    });

    serverInstance.unref();

    const config = ConfigManager.get();
    const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`; // Ensure this matches server's actual listening address

    isServerAliveAsync(healthCheckUrl, 10, 500) // Increased retries slightly for potentially slow CI
      .then((alive) => {
        if (alive) {
          resolve(serverInstance);
        } else {
          // This block is critical for diagnosing startup failures
          // eslint-disable-next-line no-console
          console.error(`[serverManagerDebug] Health check failed for ${healthCheckUrl}. ServerStdErr at this point: ${serverStdErr}`);
          if (serverStdErr) { // Check if serverStdErr has content
            // eslint-disable-next-line no-console
            console.error('MCR Server (spawned from tuiUtils) stderr content before failing health check:', serverStdErr);
          } else {
            // eslint-disable-next-line no-console
            console.error('MCR Server (spawned from tuiUtils) produced no stderr output before failing health check, or it exited cleanly before responding.');
          }
          reject(new Error(`Server failed to start or become healthy at ${healthCheckUrl}. Check logs for details.`));
        }
      })
      .catch((err) => { // Catch errors from isServerAliveAsync itself or from the promise chain
        // eslint-disable-next-line no-console
        console.error(`[serverManagerDebug] Error during server health check or preceding promise for ${healthCheckUrl}. Error: ${err.message}. ServerStdErr: ${serverStdErr}`);
        if (serverStdErr) {
            // eslint-disable-next-line no-console
            console.error('MCR Server (spawned from tuiUtils) stderr on error/catch:', serverStdErr);
        }
        reject(err); // Propagate the error
      });
  });
}

module.exports = {
  isServerAliveAsync,
  startMcrServerAsync,
};
