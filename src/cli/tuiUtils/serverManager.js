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
//  const mcrScriptPath = path.resolve(__dirname, '../../../../mcr.js'); // Adjusted path: tuiUtils -> cli -> src -> project_root
  const mcrScriptPath = path.resolve(__dirname, '../../../mcr.js'); // Corrected path: tuiUtils -> cli -> src -> project_root

  let serverStdErr = '';
  const serverInstance = spawn('node', [mcrScriptPath, 'start-server'], { // Added 'start-server'
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'], // Keep stderr piped to capture issues
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
      if (code !== 0 && signal !== 'SIGTERM') {
        const errorMessage = `MCR server process exited with code ${code} and signal ${signal}. Stderr: ${serverStdErr}`;
        // eslint-disable-next-line no-console
        console.error(errorMessage);
      }
    });

    serverInstance.unref();

    const config = ConfigManager.get();
    const healthCheckUrl = `http://${config.server.host}:${config.server.port}/`;

    isServerAliveAsync(healthCheckUrl, 10, 500)
      .then((alive) => {
        if (alive) {
          resolve(serverInstance);
        } else {
          if (serverStdErr) {
            // eslint-disable-next-line no-console
            console.error('MCR Server (spawned from tuiUtils) stderr before failing health check:', serverStdErr);
          }
          reject(new Error('Server failed to start or become healthy.'));
        }
      })
      .catch((err) => {
        if (serverStdErr) {
            // eslint-disable-next-line no-console
            console.error('MCR Server (spawned from tuiUtils) stderr on error:', serverStdErr);
        }
        reject(err);
      });
  });
}

module.exports = {
  isServerAliveAsync,
  startMcrServerAsync,
};
