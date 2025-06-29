class ApiError extends Error {
  constructor(statusCode, message, errorCode = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'ApiError';
    this.errorCode = errorCode; // Can be used for more specific client-side error handling
  }
}

module.exports = ApiError;
