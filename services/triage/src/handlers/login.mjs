import { CognitoIdentityProviderClient, InitiateAuthCommand } from '@aws-sdk/client-cognito-identity-provider';
import { loginService } from '../services/login-service.mjs';
import { ApiError } from '../errors/api-error.mjs';
import { apiResponse } from '../responses/api-response.mjs';

let cognitoClient;
function getCognitoClient() {
  if (!cognitoClient) {
    const region = process.env.AWS_REGION || 'us-west-2';
    cognitoClient = new CognitoIdentityProviderClient({ region });
  }
  return cognitoClient;
}

/**
 * AWS Lambda Handler for POST /auth/login.
 * 
 * @param {object} event - API Gateway Proxy Event
 * @param {object} [injectedDeps] - Optional injected dependencies for testing
 * @returns {Promise<object>} API Gateway Proxy Response
 */
export async function handler(event, injectedDeps = null) {
  console.log('Login request received');

  try {
    const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;

    // Validate configuration early
    if (!clientId || clientId.trim() === '') {
      throw new ApiError('CONFIGURATION_ERROR', 500, 'Cognito configurations are missing');
    }

    if (!event || event.body === undefined || event.body === null) {
      throw new ApiError('INVALID_JSON', 400, 'Request body is missing');
    }

    let parsedBody;
    try {
      parsedBody = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      throw new ApiError('INVALID_JSON', 400, 'Request body is not valid JSON', err);
    }

    const client = injectedDeps ? null : getCognitoClient();
    const deps = injectedDeps || {
      initiateAuthFn: async (email, password) => {
        return await client.send(new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: clientId,
          AuthParameters: {
            USERNAME: email,
            PASSWORD: password
          }
        }));
      }
    };

    const result = await loginService(parsedBody, deps);

    return apiResponse(200, {
      success: true,
      data: result
    });
  } catch (err) {
    if (err instanceof ApiError) {
      console.warn('Request failed', { code: err.code });
      return apiResponse(err.statusCode, {
        success: false,
        error: {
          code: err.code,
          message: err.message
        }
      });
    }

    console.error('Unhandled server error');
    return apiResponse(500, {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected internal error occurred'
      }
    });
  }
}
