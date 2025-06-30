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
    const chatProcess = spawn('node', [MCR_SCRIPT_PATH, 'chat'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let serverStartedMessage = false;
    let chatReady = false;

    chatProcess.stdout.on('data', (data) => {
      output += data.toString();
      // console.log(`CHAT STDOUT: ${data.toString()}`);
      if (output.includes('Starting MCR server...')) {
        serverStartedMessage = true;
      }
      if (output.includes('New chat session started.') || output.includes('You>')) {
        chatReady = true;
        if (serverStartedMessage) { // Only proceed if we saw the server starting message
          // Server should be up now
          isServerAlive().then(alive => {
            expect(alive).toBe(true);
            chatProcess.stdin.write('exit\\n'); // Exit chat
          });
        } else {
            // this indicates an issue, server should have been started by chat.
        }
      }
    });

    chatProcess.stderr.on('data', (data) => {
      // console.error(`CHAT STDERR: ${data.toString()}`);
      // Fail test if significant errors during startup
      if (data.toString().includes('Failed to start MCR server') || data.toString().includes('Could not start MCR server')) {
        done(new Error(`Chat process reported server start failure: ${data.toString()}`));
      }
    });

    chatProcess.on('close', async (code) => {
      expect(code).toBe(0);
      expect(serverStartedMessage).toBe(true); // Ensure we saw the attempt to start
      expect(chatReady).toBe(true); // Ensure chat actually became ready

      // Server should be stopped now
      await new Promise(resolve => setTimeout(resolve, 1000)); // Give server time to shut down
      const aliveAfter = await isServerAlive();
      expect(aliveAfter).toBe(false);
      done();
    });

    // Timeout for the test
    setTimeout(() => {
        if (!chatReady) {
            chatProcess.kill(); // ensure the process is killed if it hangs
            done(new Error('Test timed out, chat did not become ready or server check failed. Output: ' + output));
        }
    }, 20000); // 20s timeout
  }, 25000); // Jest timeout for this test

  test('mcr chat should use an existing server if one is running', (done) => {
    // Start server manually
    manuallyStartedServer = spawn('node', [MCR_SCRIPT_PATH], { detached: false, stdio: 'ignore' });

    let chatProcess;

    // Wait for manually started server to be ready
    isServerAlive(SERVER_URL, 10, 500).then(alive => {
      if (!alive) {
        if(manuallyStartedServer) manuallyStartedServer.kill();
        return done(new Error('Manually started server did not become alive.'));
      }

      expect(alive).toBe(true); // Manually started server is running

      chatProcess = spawn('node', [MCR_SCRIPT_PATH, 'chat']);
      let output = '';
      let chatReady = false;

      chatProcess.stdout.on('data', (data) => {
        output += data.toString();
        // console.log(`CHAT STDOUT (existing server): ${data.toString()}`);
        expect(output).not.toContain('Starting MCR server...'); // Should not try to start a new one
        if (output.includes('Using existing MCR server.')) {
           // Correct path
        }
        if (output.includes('New chat session started.') || output.includes('You>')) {
          chatReady = true;
          chatProcess.stdin.write('exit\\n');
        }
      });

      chatProcess.stderr.on('data', (data) => {
        // console.error(`CHAT STDERR (existing server): ${data.toString()}`);
      });

      chatProcess.on('close', async (code) => {
        expect(code).toBe(0);
        expect(output).toContain('Using existing MCR server.');
        expect(chatReady).toBe(true);

        // Manually started server should still be running
        const aliveAfter = await isServerAlive();
        expect(aliveAfter).toBe(true);

        // Cleanup: stop manually started server
        if (manuallyStartedServer) {
          manuallyStartedServer.kill('SIGTERM');
          manuallyStartedServer = null; // Important to prevent afterEach from trying to kill again
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Give it time to die
        done();
      });
    }).catch(err => {
        if(manuallyStartedServer) manuallyStartedServer.kill();
        done(err);
    });
  }, 25000);


  test('mcr status command should not start the server', (done) => {
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
