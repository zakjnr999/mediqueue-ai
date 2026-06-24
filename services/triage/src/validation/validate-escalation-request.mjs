import { ApiError } from '../errors/api-error.mjs';

/**
 * Validates the patient escalation request body.
 * Normalizes input and rejects unexpected fields.
 * 
 * @param {object} body - Request body
 * @returns {object} Normalized request object containing reviewerDisplayName
 * @throws {ApiError}
 */
export function validateEscalationRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Request body must be a valid JSON object');
  }

  // Reject unexpected properties
  const allowedKeys = ['reviewerDisplayName'];
  const actualKeys = Object.keys(body);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new ApiError('VALIDATION_ERROR', 400, `Unexpected request property: "${key}"`);
    }
  }

  if (body.reviewerDisplayName === undefined || body.reviewerDisplayName === null) {
    throw new ApiError('VALIDATION_ERROR', 400, 'reviewerDisplayName is required');
  }

  if (typeof body.reviewerDisplayName !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 400, 'reviewerDisplayName must be a string');
  }

  const name = body.reviewerDisplayName.trim();
  if (name === '') {
    throw new ApiError('VALIDATION_ERROR', 400, 'reviewerDisplayName cannot be empty');
  }

  if (name.length > 100) {
    throw new ApiError('VALIDATION_ERROR', 400, 'reviewerDisplayName must not exceed 100 characters');
  }

  return {
    reviewerDisplayName: name
  };
}
