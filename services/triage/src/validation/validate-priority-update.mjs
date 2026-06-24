import { ApiError } from '../errors/api-error.mjs';

/**
 * Validates the staff priority review payload and suggested priority.
 * Normalizes input and rejects unexpected fields.
 * 
 * @param {object} body - Request body
 * @param {string} suggestedPriority - Stored AI suggestion priority (HIGH/MEDIUM/LOW)
 * @returns {object} Normalized request object
 * @throws {ApiError}
 */
export function validatePriorityUpdate(body, suggestedPriority) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Request body must be a valid JSON object');
  }

  // Reject unexpected properties
  const allowedKeys = ['confirmedPriority', 'overrideReason'];
  const actualKeys = Object.keys(body);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new ApiError('VALIDATION_ERROR', 400, `Unexpected request property: "${key}"`);
    }
  }

  if (body.confirmedPriority === undefined || body.confirmedPriority === null) {
    throw new ApiError('VALIDATION_ERROR', 400, 'confirmedPriority is required');
  }

  if (typeof body.confirmedPriority !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 400, 'confirmedPriority must be a string');
  }

  const cp = body.confirmedPriority.trim();
  if (cp !== 'HIGH' && cp !== 'MEDIUM' && cp !== 'LOW') {
    throw new ApiError('VALIDATION_ERROR', 400, 'confirmedPriority must be HIGH, MEDIUM, or LOW');
  }

  let or = null;
  if (body.overrideReason !== undefined && body.overrideReason !== null) {
    if (typeof body.overrideReason !== 'string') {
      throw new ApiError('VALIDATION_ERROR', 400, 'overrideReason must be a string');
    }
    or = body.overrideReason.trim();
  }

  if (or && or.length > 500) {
    throw new ApiError('VALIDATION_ERROR', 400, 'overrideReason must not exceed 500 characters');
  }

  if (cp !== suggestedPriority) {
    if (!or || or === '') {
      throw new ApiError('PRIORITY_OVERRIDE_REASON_REQUIRED', 400, 'An override reason is required when the staff-confirmed priority differs from the AI suggestion');
    }
  } else {
    // If priority matches and overrideReason is empty string, normalize to null
    if (or === '') {
      or = null;
    }
  }

  return {
    confirmedPriority: cp,
    overrideReason: or
  };
}
