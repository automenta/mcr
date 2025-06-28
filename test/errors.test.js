const ApiError = require('../src/errors');

describe('ApiError', () => {
    test('should create an instance of ApiError with correct properties', () => {
        const statusCode = 404;
        const message = 'Resource not found';
        const error = new ApiError(statusCode, message);

        expect(error).toBeInstanceOf(ApiError);
        expect(error).toBeInstanceOf(Error);
        expect(error.statusCode).toBe(statusCode);
        expect(error.message).toBe(message);
        expect(error.name).toBe('ApiError');
    });

    test('should have a stack trace', () => {
        const error = new ApiError(500, 'Internal server error');
        expect(error.stack).toBeDefined();
        expect(error.stack).toContain('ApiError');
    });

    test('should allow custom messages', () => {
        const customMessage = 'Something went wrong!';
        const error = new ApiError(400, customMessage);
        expect(error.message).toBe(customMessage);
    });

    test('should allow different status codes', () => {
        const error1 = new ApiError(401, 'Unauthorized');
        expect(error1.statusCode).toBe(401);

        const error2 = new ApiError(403, 'Forbidden');
        expect(error2.statusCode).toBe(403);

        const error3 = new ApiError(500, 'Server Error');
        expect(error3.statusCode).toBe(500);
    });
});
