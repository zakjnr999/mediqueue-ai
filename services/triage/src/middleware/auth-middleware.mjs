import { ApiError } from '../errors/api-error.mjs';

/**
 * Middleware utility to enforce authentication on staff-facing routes.
 * Decodes API Gateway authorizer claims in production, or mock Bearer tokens in test/offline modes.
 * 
 * @param {object} event - API Gateway Proxy Event
 * @returns {object} Authenticated staff user claims { email, sub, displayName }
 * @throws {ApiError}
 */
export function requireAuthentication(event) {
  if (!event) {
    throw new ApiError('UNAUTHORIZED', 401, 'Unauthorized access: staff credentials required');
  }

  // 1. Check for API Gateway Cognito Authorizer claims (Production Mode)
  if (event.requestContext?.authorizer?.claims) {
    const claims = event.requestContext.authorizer.claims;
    const email = claims.email;
    const sub = claims.sub;
    const displayName = claims.name || claims['custom:displayName'] || null;

    if (!email) {
      throw new ApiError('UNAUTHORIZED', 401, 'Unauthorized access: user identity is incomplete');
    }

    return {
      email,
      sub,
      displayName
    };
  }

  // 2. Check for Authorization header (Local / Offline / Test Mode)
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    // Support mock token format in offline/test environment (e.g., Bearer mock-token-name@hospital.com)
    if (token.startsWith('mock-token-')) {
      const email = token.substring(11);
      return {
        email,
        sub: 'mock-sub-1234',
        displayName: 'Mock Staff User'
      };
    }
  }

  // Unauthorized access
  throw new ApiError('UNAUTHORIZED', 401, 'Unauthorized access: staff credentials required');
}
