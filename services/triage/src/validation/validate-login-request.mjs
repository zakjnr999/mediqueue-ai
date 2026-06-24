import { ApiError } from '../errors/api-error.mjs';

/**
 * Validates the login request payload.
 * 
 * @param {object} body - Request body
 * @returns {object} Normalized credentials (email, password)
 * @throws {ApiError}
 */
export function validateLoginRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'Request body must be a valid JSON object');
  }

  // Reject unexpected properties
  const allowedKeys = ['email', 'password'];
  const actualKeys = Object.keys(body);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new ApiError('VALIDATION_ERROR', 400, `Unexpected request property: "${key}"`);
    }
  }

  if (body.email === undefined || body.email === null) {
    throw new ApiError('VALIDATION_ERROR', 400, 'email is required');
  }

  if (typeof body.email !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 400, 'email must be a string');
  }

  const email = body.email.trim();
  if (email === '') {
    throw new ApiError('VALIDATION_ERROR', 400, 'email cannot be empty');
  }

  // Simple email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError('VALIDATION_ERROR', 400, 'email must be a valid email address');
  }

  if (body.password === undefined || body.password === null) {
    throw new ApiError('VALIDATION_ERROR', 400, 'password is required');
  }

  if (typeof body.password !== 'string') {
    throw new ApiError('VALIDATION_ERROR', 400, 'password must be a string');
  }

  const password = body.password;
  if (password === '') {
    throw new ApiError('VALIDATION_ERROR', 400, 'password cannot be empty');
  }

  return {
    email,
    password
  };
}
