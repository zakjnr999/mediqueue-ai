import { ApiError } from '../errors/api-error.mjs';
import { isValidCalendarDate } from '../pagination/pagination-token.mjs';

/**
 * Validates the GET /queue/stats query parameters and returns normalized fields.
 * Rejects unexpected options.
 * 
 * @param {object} queryParams 
 * @returns {object} Normalized query parameters
 * @throws {ApiError}
 */
export function validateStatsQuery(queryParams) {
  if (!queryParams || typeof queryParams !== 'object') {
    throw new ApiError('VALIDATION_ERROR', 400, 'Query parameters must be provided');
  }

  // Reject unexpected query parameters
  const allowedKeys = ['date'];
  const actualKeys = Object.keys(queryParams);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new ApiError('VALIDATION_ERROR', 400, `Unexpected query parameter: "${key}"`);
    }
  }

  const normalized = {};

  // Validate date (optional)
  if (queryParams.date !== undefined && queryParams.date !== null) {
    if (typeof queryParams.date !== 'string') {
      throw new ApiError('VALIDATION_ERROR', 400, 'Parameter "date" must be a string');
    }
    const trimmedDate = queryParams.date.trim();
    if (!isValidCalendarDate(trimmedDate)) {
      throw new ApiError('VALIDATION_ERROR', 400, 'Parameter "date" must be a valid calendar date in YYYY-MM-DD format');
    }
    normalized.date = trimmedDate;
  } else {
    // Default to current UTC date YYYY-MM-DD
    normalized.date = new Date().toISOString().slice(0, 10);
  }

  return normalized;
}
