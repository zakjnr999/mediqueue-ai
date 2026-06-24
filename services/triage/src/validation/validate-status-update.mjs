import { ApiError } from '../errors/api-error.mjs';

/**
 * Validates the patient status update request body.
 * Normalizes input and rejects unexpected fields.
 * 
 * @param {object} body - Request body
 * @returns {object} Normalized request object
 * @throws {ApiError}
 */
export function validateStatusUpdate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Request body must be a valid JSON object');
  }

  // Reject unexpected properties
  const allowedKeys = ['status'];
  const actualKeys = Object.keys(body);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new ApiError('VALIDATION_ERROR', 400, `Unexpected request property: "${key}"`);
    }
  }

  if (body.status === undefined || body.status === null) {
    throw new ApiError('VALIDATION_ERROR', 400, 'status is required');
  }

  if (typeof body.status !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 400, 'status must be a string');
  }

  const s = body.status.trim();
  if (s !== 'WAITING' && s !== 'IN_PROGRESS' && s !== 'COMPLETED') {
    throw new ApiError('VALIDATION_ERROR', 400, 'status must be WAITING, IN_PROGRESS, or COMPLETED');
  }

  return {
    status: s
  };
}
