export class CheckinError extends Error {
  /**
   * @param {string} code - The controlled error code (e.g. 'VALIDATION_ERROR')
   * @param {number} statusCode - The HTTP status code (e.g. 400, 500)
   * @param {string} message - Client-safe error message
   * @param {Error|object} [cause] - Optional internal cause for detailed server logging
   */
  constructor(code, statusCode, message, cause = null) {
    super(message);
    this.name = 'CheckinError';
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;
  }
}
