import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { escalatePatientService } from '../services/escalate-patient-service.mjs';
import { getPatientDetails, escalatePatient } from '../repositories/patient-repository.mjs';
import { requireAuthentication } from '../middleware/auth-middleware.mjs';
import { ApiError } from '../errors/api-error.mjs';
import { apiResponse } from '../responses/api-response.mjs';

// Lazy client instantiation
let docClient;
function getDocClient() {
  if (!docClient) {
    const region = process.env.AWS_REGION || 'us-west-2';
    const client = new DynamoDBClient({ region });
    docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        removeUndefinedValues: true,
        convertClassInstanceToMap: true
      }
    });
  }
  return docClient;
}

/**
 * Factory function to create POST /patients/{patientId}/escalate Lambda handler.
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
  if (dependencies.getDocClientFn !== undefined && typeof dependencies.getDocClientFn !== 'function') {
    throw new Error('Dependency "getDocClientFn" must be a function');
  }
  if (dependencies.getDocClientFn) {
    const required = ['nowFn'];
    for (const name of required) {
      if (typeof dependencies[name] !== 'function') {
        throw new Error(`Dependency "${name}" must be a function`);
      }
    }
  }

  return async function handleRequest(event, context) {
    console.log('Patient escalation request received');

    try {
      requireAuthentication(event);

      const tableName = process.env.PATIENTS_TABLE_NAME;

      // Validate table configuration early
      if (!tableName || tableName.trim() === '') {
        throw new ApiError('CONFIGURATION_ERROR', 500, 'Unable to process request');
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

      const patientId = event?.pathParameters?.patientId;

      const client = dependencies.getDocClientFn ? dependencies.getDocClientFn() : null;
      const deps = {
        getPatientDetailsFn: dependencies.getPatientDetailsFn || (dependencies.getDocClientFn ? (async (id) => {
          return await getPatientDetails(client, tableName, id);
        }) : null),
        escalatePatientFn: dependencies.escalatePatientFn || (dependencies.getDocClientFn ? (async (id, params) => {
          const updated = await escalatePatient(client, tableName, id, params);
          console.log('Patient escalation saved');
          return updated;
        }) : null),
        nowFn: dependencies.nowFn || (() => new Date())
      };

      const serviceFn = dependencies.serviceFn;
      const result = await serviceFn(patientId, parsedBody, deps);

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
        const SAFE_INTERNAL_CODES = new Set([
          'DATABASE_ERROR',
          'CONFIGURATION_ERROR'
        ]);
        const safeMessage = SAFE_INTERNAL_CODES.has(err.code)
          ? 'Unable to process request'
          : err.message;
        return apiResponse(err.statusCode, {
          success: false,
          error: {
            code: err.code,
            message: safeMessage
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
  serviceFn: escalatePatientService,
  getDocClientFn: getDocClient,
  nowFn: () => new Date()
});

export const handler = createHandler(prodDeps);
