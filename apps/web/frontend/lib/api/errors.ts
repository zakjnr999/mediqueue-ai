/**
 * Standardised API error model.
 *
 * Distinguishes HTTP-level errors (status code returned by the server)
 * from network/fetch-level errors (no response, timeout, abort).
 */

/**
 * Error returned when the server responds with a non-2xx status code.
 * Preserves the backend error code and message safely.
 */
export class ApiHttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly backendMessage: string;

  constructor(status: number, code: string, backendMessage: string) {
    super(`API Error [${code}]: ${backendMessage}`);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.backendMessage = backendMessage;
  }

  /** Returns a human-safe message suitable for display to end users. */
  getUserMessage(): string {
    if (this.status === 401) return 'Session expired. Please sign in again.';
    if (this.status === 403) return 'You do not have permission to perform this action.';
    if (this.status === 404) return 'The requested resource was not found.';
    if (this.status === 409) return 'This could not be completed due to a conflict. Please refresh and try again.';
    if (this.status >= 500) return 'A server error occurred. Please try again later.';
    return this.backendMessage || 'An unexpected error occurred.';
  }
}

/**
 * Error thrown when the request itself fails (network offline, DNS failure,
 * timeout, user abort) before a response is received.
 */
export class ApiNetworkError extends Error {
  public readonly originalError: unknown;

  constructor(originalError: unknown) {
    super('A network error occurred. Please check your connection and try again.');
    this.name = 'ApiNetworkError';
    this.originalError = originalError;
  }
}
