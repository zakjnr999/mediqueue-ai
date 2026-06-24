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
 * Factory function to create POST /auth/login Lambda handler.
 * 
 * @param {object} dependencies - Injected dependencies
 * @returns {Function} AWS Lambda handler
 */
export function createHandler(dependencies) {
  if (!dependencies || typeof dependencies !== 'object') {
    throw new Error('Dependencies object is required');
  }
  if (typeof dependencies.serviceFn !== 'function') {
    throw new Error('Dependency "serviceFn" must be a function');
  }
  if (dependencies.getCognitoClientFn !== undefined && typeof dependencies.getCognitoClientFn !== 'function') {
    throw new Error('Dependency "getCognitoClientFn" must be a function');
  }
  if (dependencies.getCognitoClientFn) {
    const required = ['initiateAuthFn'];
    for (const name of required) {
      if (typeof dependencies[name] !== 'function') {
        throw new Error(`Dependency "${name}" must be a function`);
      }
    }
  }

  return async function handleRequest(event, context) {
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

      const client = dependencies.getCognitoClientFn ? dependencies.getCognitoClientFn() : null;
      const deps = {
        initiateAuthFn: dependencies.initiateAuthFn ? async (email, password) => {
          return await dependencies.initiateAuthFn(client, clientId, email, password);
        } : null
      };

      const result = await dependencies.serviceFn(parsedBody, deps);

      return apiResponse(200, {
        success: true,
        data: result
      });
    } catch (err) {
      if (err instanceof ApiError) {
        console.warn("Request failed", {
          code: err.code,
          requestId: context?.awsRequestId,
        });
        return apiResponse(err.statusCode, {
          success: false,
          error: {
            code: err.code,
            message: err.message
          }
        });
      }

      console.error("Unhandled server error", {
        requestId: context?.awsRequestId,
      });
      return apiResponse(500, {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected internal error occurred'
        }
      });
    }
  };
}

const prodDeps = Object.freeze({
  serviceFn: loginService,
  getCognitoClientFn: getCognitoClient,
  initiateAuthFn: async (client, clientId, email, password) => {
    return await client.send(new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password
      }
    }));
  }
});

export const handler = createHandler(prodDeps);
