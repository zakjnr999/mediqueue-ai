import { validateLoginRequest } from '../validation/validate-login-request.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to authenticate staff members against Cognito User Pool.
 * 
 * @param {object} body - Request body
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.initiateAuthFn - (email, password) => Promise<authResult>
 * @returns {Promise<object>} Auth tokens response payload
 * @throws {ApiError}
 */
export async function loginService(body, deps = {}) {
  const { initiateAuthFn } = deps;

  if (!initiateAuthFn) {
    throw new ApiError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Input validation & normalization
  const { email, password } = validateLoginRequest(body);

  try {
    // 2. Perform authentication command
    const authResult = await initiateAuthFn(email, password);

    if (!authResult || !authResult.AuthenticationResult) {
      throw new ApiError('UNAUTHORIZED', 401, 'Authentication failed');
    }

    const { AccessToken, IdToken, RefreshToken, ExpiresIn } = authResult.AuthenticationResult;

    // 3. Return mapped tokens
    return {
      accessToken: AccessToken || '',
      idToken: IdToken || '',
      refreshToken: RefreshToken || '',
      expiresIn: ExpiresIn || 0
    };
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }

    // Map Cognito errors to generic safe API errors
    if (
      err.name === 'NotAuthorizedException' ||
      err.name === 'UserNotFoundException' ||
      err.name === 'UserNotConfirmedException'
    ) {
      throw new ApiError('UNAUTHORIZED', 401, 'Invalid email or password', err);
    }

    if (err.name === 'PasswordResetRequiredException') {
      throw new ApiError('PASSWORD_RESET_REQUIRED', 400, 'Password reset is required', err);
    }

    throw new ApiError('AUTH_SERVICE_ERROR', 500, `Authentication service failure: ${err.message}`, err);
  }
}
