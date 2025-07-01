const { exec, spawn } = require('child_process');
const axios = require('axios');
const ConfigManager = require('../src/config');
const path = require('path');
// const fs = require('fs'); // Unused

// Corrected: MCR_SCRIPT_PATH points to the main CLI entry script.
const MCR_SCRIPT_PATH = path.resolve(__dirname, '../mcr.js');
const config = ConfigManager.get();
// Use 127.0.0.1 for client-side checking, even if server binds to 0.0.0.0
const SERVER_CHECK_HOST = '127.0.0.1';
const SERVER_URL = `http://${SERVER_CHECK_HOST}:${config.server.port}`;
const SERVER_PORT = config.server.port;

// Utility function to check if server is alive
async function isServerAlive(url = SERVER_URL, retries = 3, delay = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      // Increased timeout for axios GET request
      await axios.get(url, { timeout: 1000 });
      return true;
    } catch {
      // _error removed
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Utility function to stop a server if running (platform dependent, basic attempt)
function killServerProcess(port) {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`netstat -ano | findstr ":${port}"`, (_err, stdout) => {
        // err is unused
        if (stdout) {
          const lines = stdout.split('\\n');
          const lineWithPid = lines.find((line) => line.includes('LISTENING'));
          if (lineWithPid) {
            const match = lineWithPid.match(/\\s(\\d+)$/);
            if (match && match[1]) {
              const pid = match[1];
              exec(`taskkill /PID ${pid} /F`, () => resolve());
              return;
            }
          }
        }
        resolve();
      });
    } else {
      // Assumes Unix-like
      exec(`lsof -ti :${port} -sTCP:LISTEN`, (_err, stdout) => {
        // err is unused
        if (stdout) {
          const pid = stdout.trim();
          exec(`kill -9 ${pid}`, () => resolve());
          return;
        }
        resolve();
      });
    }
  });
}

describe('mcr chat command integration', () => {
  let manuallyStartedServer = null;

  beforeEach(async () => {
    // Ensure no server is running on the port before each test
    if (await isServerAlive()) {
      // console.warn(`Server was running on port ${SERVER_PORT} before a test. Attempting to kill.`);
      await killServerProcess(SERVER_PORT);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Give time for port to free up
      if (await isServerAlive()) {
        throw new Error(
          `Failed to stop existing server on port ${SERVER_PORT} before test.`
        );
      }
    }
  });

  afterEach(async () => {
    if (manuallyStartedServer) {
      manuallyStartedServer.kill('SIGTERM');
      manuallyStartedServer = null;
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for server to die
    }
    if (await isServerAlive()) {
      await killServerProcess(SERVER_PORT);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });

  test.skip('mcr chat should start the server if not running, and server should stop after chat exits', async () => {
    const chatProcess = spawn('node', [MCR_SCRIPT_PATH, 'chat'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // let stdoutData = ''; // Unused variable removed
    // let serverShouldHaveStarted = false; // Unused

    chatProcess.stdout.on('data', (_data) => {
      // data marked as unused
      // stdoutData += data.toString(); // No longer appending to unused variable
      // if (stdoutData.includes('Starting MCR server...')) { // This log might be unreliable with TUI
      //   serverShouldHaveStarted = true;
      // }
    });

    let serverStartError = null;
    chatProcess.stderr.on('data', (data) => {
      const stderrStr = data.toString();
      if (stderrStr.includes('Critical: Failed to start MCR server')) {
        serverStartError = new Error(
          `Chat process reported server start failure: ${stderrStr}`
        );
      }
    });

    const chatProcessClosed = new Promise((resolve, _reject) => {
      // reject renamed to _reject
      chatProcess.on('close', resolve);
      chatProcess.on('error', _reject); // reject renamed to _reject
    });

    try {
      // 1. Check if server starts
      await new Promise((resolve) => setTimeout(resolve, 7000)); // Give time for server to start
      if (serverStartError) throw serverStartError; // Fail early if server start error was detected

      const alive = await isServerAlive(SERVER_URL, 5, 300);
      expect(alive).toBe(true); // Server should be running

      // 2. Terminate chat process
      chatProcess.kill('SIGTERM');
      await chatProcessClosed; // Wait for process to actually close

      // 3. Check if server stops
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Give server time to shut down
      const aliveAfter = await isServerAlive();
      expect(aliveAfter).toBe(false); // Server should be stopped
    } catch (e) {
      if (!chatProcess.killed) chatProcess.kill();
      throw e; // Re-throw to fail the test
    } finally {
      if (!chatProcess.killed) chatProcess.kill(); // Ensure cleanup
    }
  }, 30000);

  test('mcr chat should use an existing server if one is running', async () => {
    let manuallyStartedServerStderr = '';
    const mcrServerScript = path.resolve(__dirname, '../mcr.js');
    // Explicitly use 'start-server' command for clarity and robustness in tests
    manuallyStartedServer = spawn('node', [mcrServerScript, 'start-server'], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    manuallyStartedServer.stderr.on('data', (_data) => {
      // data unused
      manuallyStartedServerStderr += _data.toString();
    });

    let chatProcess;
    let stdoutData = '';

    try {
      // Increased retries and delay for server health check
      const serverIsUp = await isServerAlive(SERVER_URL, 20, 600);
      if (!serverIsUp) {
        console.error(`DEBUG: Manually started server Stderr: ${manuallyStartedServerStderr}`); // Added explicit log
        throw new Error(
          `Manually started server did not become alive. Stderr: ${manuallyStartedServerStderr}`
        );
      }
      expect(serverIsUp).toBe(true);

      chatProcess = spawn('node', [MCR_SCRIPT_PATH, 'chat'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const chatProcessClosed = new Promise((resolve) =>
        chatProcess.on('close', resolve)
      );

      chatProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        expect(stdoutData).not.toContain('Starting MCR server...');
      });

      // Let TUI run for a bit
      await new Promise((resolve) => setTimeout(resolve, 5000));

      chatProcess.kill('SIGTERM');
      await chatProcessClosed;

      const aliveAfterChatExit = await isServerAlive();
      expect(aliveAfterChatExit).toBe(true); // Server should still be running

      // Optional: Check for "Existing MCR server detected." if it's reliably logged before Ink.
      // if (stdoutData.includes('Existing MCR server detected.')) { /* good */ }
    } finally {
      if (manuallyStartedServer && !manuallyStartedServer.killed) {
        manuallyStartedServer.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        manuallyStartedServer = null;
        const serverFinallyDown = await isServerAlive();
        if (serverFinallyDown) {
          /* This could be an issue if it's not down */
        }
      }
      if (chatProcess && !chatProcess.killed) {
        chatProcess.kill('SIGKILL');
      }
    }
  }, 30000);

  test('mcr status command should not start the server', async () => {
    let commandError = null;
    let commandStdout = '';
    let commandStderr = '';

    // try removed for no-useless-catch
    await new Promise((resolve) => {
      // reject removed as it's not used in this path
      exec(
        `node ${MCR_SCRIPT_PATH} status`,
        { timeout: 15000 },
        (error, stdout, stderr) => {
          commandError = error;
          commandStdout = stdout;
          commandStderr = stderr;
          if (error && error.signal !== 'SIGTERM') {
            // SIGTERM is OK if timeout killed it
          }
          resolve();
        }
      );
    });
    // catch (e) removed

    // With process.exit(0) in statusCommands.js, `commandError` should be null.
    // If it's not null, it means the command exited with non-zero, which is unexpected.
    if (commandError) {
      // console.error(`Status command process error. STDERR: ${commandStderr}, STDOUT: ${commandStdout}, Error obj: ${commandError}`);
    }
    expect(commandError).toBeNull();
    expect(commandStderr).toBe('');
    expect(commandStdout).toMatch(
      /MCR API server not reachable.*Status: Offline|MCR API Status/
    );

    const alive = await isServerAlive();
    expect(alive).toBe(false);
  }, 20000);
});
