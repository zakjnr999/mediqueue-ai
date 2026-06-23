import { ApiError } from '../errors/api-error.mjs';
import { isValidCalendarDate } from '../pagination/pagination-token.mjs';

/**
 * Validates the GET /queue query parameters and returns normalized fields.
 * Rejects unexpected options.
 * 
 * @param {object} queryParams 
 * @returns {object} Normalized query parameters
 * @throws {ApiError}
 */
export function validateQueueQuery(queryParams) {
  if (!queryParams || typeof queryParams !== 'object') {
    throw new ApiError('VALIDATION_ERROR', 400, 'Query parameters must be provided');
  }

  // Reject unexpected query parameters
  const allowedKeys = ['date', 'limit', 'nextToken'];
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

  // Validate limit (optional)
  if (queryParams.limit !== undefined && queryParams.limit !== null) {
    const limitStr = String(queryParams.limit).trim();
    if (!/^\d+$/.test(limitStr)) {
      throw new ApiError('VALIDATION_ERROR', 400, 'Parameter "limit" must be a positive integer');
    }
    const limitVal = parseInt(limitStr, 10);
    if (limitVal < 1 || limitVal > 50) {
      throw new ApiError('VALIDATION_ERROR', 400, 'Parameter "limit" must be between 1 and 50');
    }
    normalized.limit = limitVal;
  } else {
    normalized.limit = 20;
  }

  // Validate nextToken (optional)
  if (queryParams.nextToken !== undefined && queryParams.nextToken !== null) {
    if (typeof queryParams.nextToken !== 'string') {
      throw new ApiError('VALIDATION_ERROR', 400, 'Parameter "nextToken" must be a string');
    }
    const trimmedToken = queryParams.nextToken.trim();
    if (trimmedToken === '') {
      throw new ApiError('VALIDATION_ERROR', 400, 'Parameter "nextToken" cannot be empty');
    }
    normalized.nextToken = trimmedToken;
  } else {
    normalized.nextToken = null;
  }

  return normalized;
}
