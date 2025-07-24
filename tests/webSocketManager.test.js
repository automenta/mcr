const TuiWebSocketManager = require('../src/tui/webSocketManager');
const WebSocket = require('ws');

jest.mock('ws');

describe('TuiWebSocketManager', () => {
    let wsManager;
    let mockSocket;

    beforeEach(() => {
        wsManager = new TuiWebSocketManager('ws://localhost:8080/ws');
        mockSocket = {
            on: jest.fn(),
            send: jest.fn(),
            close: jest.fn(),
            readyState: WebSocket.OPEN
        };
        wsManager.socket = mockSocket;
        wsManager.connected = true;
    });

    describe('invoke', () => {
        it('should send a correctly formatted tool_invoke message', () => {
            const toolName = 'test.tool';
            const input = { arg1: 'value1' };
            wsManager.invoke(toolName, input);

            expect(mockSocket.send).toHaveBeenCalledTimes(1);
            const sentMessage = JSON.parse(mockSocket.send.mock.calls[0][0]);

            expect(sentMessage.type).toBe('tool_invoke');
            expect(sentMessage.payload.tool_name).toBe(toolName);
            expect(sentMessage.payload.input).toEqual(input);
            expect(sentMessage.messageId).toMatch(/^client-msg-\d+$/);
        });
    });

    describe('close', () => {
        it('should call the socket close method', () => {
            wsManager.close();
            expect(mockSocket.close).toHaveBeenCalledTimes(1);
        });

        it('should not throw if socket is null', () => {
            wsManager.socket = null;
            expect(() => wsManager.close()).not.toThrow();
        });
    });
});
