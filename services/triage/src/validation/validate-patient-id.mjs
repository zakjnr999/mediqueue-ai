import { ApiError } from '../errors/api-error.mjs';

const UUID_V4_STRICT_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a patientId string is a canonical UUID v4.
 * Rejects slashes, spaces, query strings, prefix patterns, and key content.
 * Normalizes valid UUIDs to lowercase.
 * 
 * @param {string} patientId 
 * @returns {string} Lowercase UUID v4 string
 * @throws {ApiError}
 */
export function validatePatientId(patientId) {
  if (patientId === undefined || patientId === null) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Patient ID is required');
  }
  if (typeof patientId !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 400, 'Patient ID must be a string');
  }

  const trimmed = patientId.trim();

  // Reject malicious attempts, slashes, hashes, spaces, and prefixed values
  if (
    trimmed.includes('/') ||
    trimmed.includes(' ') ||
    trimmed.includes('?') ||
    trimmed.includes('#') ||
    trimmed.toLowerCase().includes('patient')
  ) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Patient ID contains invalid characters or structures');
  }

  if (!UUID_V4_STRICT_REGEX.test(trimmed)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Patient ID must be a valid UUID v4');
  }

  return trimmed.toLowerCase();
}
