// server/demoUtils/Example.js
const mcrService = require('../services/mcrService');
const logger = require('../logger');

class Example {
    constructor(sessionIdForDemo) {
        this.sessionId = sessionIdForDemo;
        this.dLog = {
            step: (msg) => logger.info(`[Demo: ${this.getName()}] STEP: ${msg}`),
            info: (msg) => logger.info(`[Demo: ${this.getName()}] INFO: ${msg}`),
            success: (msg) => logger.info(`[Demo: ${this.getName()}] SUCCESS: ${msg}`),
            error: (msg) => logger.error(`[Demo: ${this.getName()}] ERROR: ${msg}`),
            divider: () => logger.info(`[Demo: ${this.getName()}] --------------------`),
        };
    }

    getName() { throw new Error("Not implemented by demo subclass"); }
    getDescription() { throw new Error("Not implemented by demo subclass"); }
    async run() { throw new Error("Not implemented by demo subclass"); }

    async createSession() {
        // Demos should run in a provided session. This method confirms it.
        this.dLog.info(`Demo configured to run in session: ${this.sessionId}`);
        if (!this.sessionId) {
            const errMsg = "Demo requires a sessionId to be provided to its constructor.";
            this.dLog.error(errMsg);
            throw new Error(errMsg);
        }
        // Optionally, verify session exists via mcrService.getSession(this.sessionId) if needed.
        // For now, assume session ID is valid and will be used in subsequent calls.
    }

    async assertFact(textContent, type = 'nl') {
        this.dLog.info(`Asserting (${type}): ${textContent.substring(0, 100)}${textContent.length > 100 ? '...' : ''}`);
        if (!this.sessionId) {
            const errMsg = "Missing sessionId for assertFact in demo.";
            this.dLog.error(errMsg);
            throw new Error(errMsg);
        }

        let result;
        if (type === 'prolog') {
            result = await mcrService.assertRawPrologToSession(this.sessionId, textContent);
        } else {
            result = await mcrService.assertNLToSession(this.sessionId, textContent);
        }

        if (!result || !result.success) {
            const errorMsg = `Failed to assert: ${result?.message || result?.error?.message || 'Unknown error'}`;
            this.dLog.error(errorMsg, result?.error || '');
            throw new Error(errorMsg);
        }
        const addedItems = result.addedFacts || result.addedProlog || [];
        this.dLog.success(`Asserted. Added: ${addedItems.length} items. First few: ${JSON.stringify(addedItems.slice(0,2))}`);
        return result;
    }

    async query(naturalLanguageQuestion) {
        this.dLog.info(`Querying: ${naturalLanguageQuestion}`);
        if (!this.sessionId) {
            const errMsg = "Missing sessionId for query in demo.";
            this.dLog.error(errMsg);
            throw new Error(errMsg);
        }
        const result = await mcrService.querySessionWithNL(this.sessionId, naturalLanguageQuestion);

        if (!result || !result.success) {
            const errorMsg = `Query failed: ${result?.message || result?.error?.message || 'Unknown error'}`;
            this.dLog.error(errorMsg, result?.error || result?.debugInfo || '');
            throw new Error(errorMsg);
        }
        this.dLog.success(`Query answer: ${result.answer.substring(0,100)}${result.answer.length > 100 ? '...' : ''}`);
        return result;
    }

    async assertCondition(condition, successMessage, errorMessage) {
        if (condition) {
            this.dLog.success(successMessage);
        } else {
            this.dLog.error(errorMessage);
            // Optionally throw to halt demo, or just log and continue
            // For robustness in demos, perhaps don't throw here unless critical.
        }
        return condition;
    }
}

module.exports = Example;
