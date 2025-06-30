const { exec, spawn } = require('child_process');
const axios = require('axios');
const ConfigManager = require('../src/config');
const path = require('path');
const fs = require('fs');

const MCR_SCRIPT_PATH = path.resolve(__dirname, '../mcr.js');
const config = ConfigManager.get();
const SERVER_URL = `http://${config.server.host}:${config.server.port}`;
const SERVER_PORT = config.server.port;

// Utility function to check if server is alive
async function isServerAlive(url = SERVER_URL, retries = 3, delay = 300) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(url, { timeout: 250 });
      return true;
    } catch (error) {
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  return false;
}

// Utility function to stop a server if running (platform dependent, basic attempt)
// This is hard to do reliably cross-platform without more tools.
// For tests, we'll primarily rely on the chat command itself cleaning up.
// This function is more of a safeguard.
function killServerProcess(port) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      exec(`netstat -ano | findstr ":${port}"`, (err, stdout) => {
        if (stdout) {
          const lines = stdout.split('\\n');
          const lineWithPid = lines.find(line => line.includes('LISTENING'));
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
    } else { // Assumes Unix-like
      exec(`lsof -ti :${port} -sTCP:LISTEN`, (err, stdout) => {
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
      console.warn(`Server was running on port ${SERVER_PORT} before a test. Attempting to kill.`);
      await killServerProcess(SERVER_PORT);
      await new Promise(resolve => setTimeout(resolve, 1000)); // Give time for port to free up
      if (await isServerAlive()) {
        throw new Error(`Failed to stop existing server on port ${SERVER_PORT} before test.`);
      }
    }
  });

  afterEach(async () => {
    if (manuallyStartedServer) {
      manuallyStartedServer.kill('SIGTERM');
      manuallyStartedServer = null;
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait for server to die
    }
    // Additional cleanup to ensure server is down
    if (await isServerAlive()) {
      // console.warn(`Server was still running on port ${SERVER_PORT} after a test. Attempting to kill.`);
      await killServerProcess(SERVER_PORT);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  test('mcr chat should start the server if not running, and server should stop after chat exits', (done) => {
    // Test a TUI is very different. We will focus on server lifecycle.
    // We can't easily check for "chatReady" or send stdin commands like "exit" to a full-screen TUI.
    const chatProcess = spawn('node', [MCR_SCRIPT_PATH, 'chat'], { stdio: ['ignore', 'pipe', 'pipe'] }); // stdin ignored
    let stdoutData = '';
    let serverShouldHaveStarted = false;

    chatProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
      // Check for the pre-Ink log message indicating an attempt to start the server.
      if (stdoutData.includes('Starting MCR server...')) {
        serverShouldHaveStarted = true;
      }
      // We can't reliably check for "chat ready" or TUI prompts anymore.
    });

    chatProcess.stderr.on('data', (data) => {
      // console.error(`CHAT TUI STDERR: ${data.toString()}`);
      // Fail test if significant errors during startup that appear on stderr
      // Note: Ink might also use stderr for rendering in some terminals.
      // This check might need refinement if too noisy.
      if (data.toString().includes('Critical: Failed to start MCR server')) {
        chatProcess.kill();
        done(new Error(`Chat process reported server start failure: ${data.toString()}`));
      }
    });

    // 1. Check if server starts
    // Give the TUI and server time to start up.
    setTimeout(async () => {
      try {
        const alive = await isServerAlive(SERVER_URL, 5, 300); // More retries for server to boot
        expect(alive).toBe(true); // Server should be running
        expect(serverShouldHaveStarted).toBe(true); // We should have seen the message too

        // 2. Terminate chat process (simulating Ctrl+C or closing window)
        chatProcess.kill('SIGTERM'); // Send SIGTERM to allow graceful shutdown
      } catch (e) {
        chatProcess.kill(); // Ensure it's killed on error
        done(e);
      }
    }, 7000); // Increased timeout for server to start reliably

    chatProcess.on('close', async (code) => {
      // With SIGTERM, code might be null or a signal code.
      // We are less concerned about exit code 0 here as TUI termination is different.
      // The main check is that the server it started is now stopped.

      // 3. Check if server stops after chat TUI is terminated
      await new Promise(resolve => setTimeout(resolve, 2000)); // Give server time to shut down
      const aliveAfter = await isServerAlive();
      expect(aliveAfter).toBe(false); // Server should be stopped
      done();
    });

    // Overall timeout for the test
    setTimeout(() => {
      if (!chatProcess.killed) {
          chatProcess.kill();
          done(new Error('Test timed out. Chat process did not complete checks or close in time. Stdout: ' + stdoutData));
      }
    }, 25000); // Jest timeout for this specific test can be longer
  }, 30000);

  test('mcr chat should use an existing server if one is running', (done) => {
    manuallyStartedServer = spawn('node', [MCR_SCRIPT_PATH], { detached: false, stdio: 'ignore' });
    let chatProcess;
    let stdoutData = '';

    isServerAlive(SERVER_URL, 10, 500).then(async (serverIsUp) => {
      if (!serverIsUp) {
        if (manuallyStartedServer) manuallyStartedServer.kill();
        return done(new Error('Manually started server did not become alive.'));
      }
      expect(serverIsUp).toBe(true);

      chatProcess = spawn('node', [MCR_SCRIPT_PATH, 'chat'], { stdio: ['ignore', 'pipe', 'pipe'] });

      chatProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        // We expect NOT to see "Starting MCR server..."
        expect(stdoutData).not.toContain('Starting MCR server...');
        // We might see "Existing MCR server detected." before Ink takes over.
      });

      chatProcess.stderr.on('data', (data) => {
        // console.error(`CHAT TUI (existing server) STDERR: ${data.toString()}`);
      });

      // Let the TUI run for a bit
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Terminate chat process
      chatProcess.kill('SIGTERM');

      chatProcess.on('close', async () => {
        // Manually started server should still be running
        const aliveAfter = await isServerAlive();
        expect(aliveAfter).toBe(true);

        if (stdoutData.includes('Existing MCR server detected.')) {
            // This is good, means it logged correctly before Ink took over.
        }

        // Cleanup: stop manually started server
        if (manuallyStartedServer) {
          manuallyStartedServer.kill('SIGTERM');
          manuallyStartedServer = null;
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Give it time to die
        done();
      });

    }).catch(err => {
      if (manuallyStartedServer) manuallyStartedServer.kill();
      if (chatProcess && !chatProcess.killed) chatProcess.kill();
      done(err);
    });
  }, 30000);


  test('mcr status command should not start the server', (done) => {
    // This test remains valid as it doesn't involve the chat TUI.
    exec(`node ${MCR_SCRIPT_PATH} status`, async (error, stdout, stderr) => {
      expect(error).toBeNull();
      expect(stderr).toBe('');
      expect(stdout).toContain('MCR API Status'); // Or whatever your status command outputs

      const alive = await isServerAlive();
      expect(alive).toBe(false); // Server should not have been started
      done();
    });
  }, 10000);
});
