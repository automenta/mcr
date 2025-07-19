import WebSocketManager from '../../shared/services/WebSocketService.js';
import LogDisplay from '../../shared/components/LogDisplay.js';

// Import all demos
import AbstractReasoningDemo from '../../../../src/demo/AbstractReasoningDemo.js';
import ErrorHandlingDemo from '../../../../src/demo/errorHandlingDemo.js';
import FamilyOntologyDemo from '../../../../src/demo/familyOntologyDemo.js';
import ScientificKBDemo from '../../../../src/demo/scientificKBDemo.js';
import SimpleAssertionsDemo from '../../../../src/demo/simpleAssertionsDemo.js';
import SimpleQADemo from '../../../../src/demo/simpleQADemo.js';

const demos = [
    new AbstractReasoningDemo(),
    new ErrorHandlingDemo(),
    new FamilyOntologyDemo(),
    new ScientificKBDemo(),
    new SimpleAssertionsDemo(),
    new SimpleQADemo(),
];

const demoMenu = document.getElementById('demo-menu');
const output = document.getElementById('output');
const debugToggle = document.getElementById('debug-toggle');

async function main() {
    await WebSocketManager.connect();
    const { sessionId } = await WebSocketManager.invoke('createSession');

    demos.forEach(demo => {
        const button = document.createElement('button');
        button.className = 'demo-button';
        button.textContent = demo.getName();
        button.onclick = async () => {
            const logDisplay = new LogDisplay({
                demoName: demo.getName(),
                demoDescription: demo.getDescription(),
                debug: debugToggle.checked,
            });
            output.appendChild(logDisplay);

            const logCollector = (log) => {
                logDisplay.addLog(log.level, log.message, log.details);
            };

            const demoInstance = new demo.constructor(sessionId, logCollector, WebSocketManager);

            try {
                await demoInstance.run();
            } catch (error) {
                logCollector({level: 'error', message: `Unhandled exception in demo: ${error.message}`});
                console.error(error);
            }
        };
        demoMenu.appendChild(button);
    });
}

main();
