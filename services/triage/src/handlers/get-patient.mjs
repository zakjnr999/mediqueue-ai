import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getPatientService } from '../services/get-patient-service.mjs';
import { getPatientDetails, countPeopleAhead } from '../repositories/patient-repository.mjs';
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
 * Factory function to create GET /patients/{patientId} Lambda handler.
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
    const required = ['getPatientDetailsFn', 'countPeopleAheadFn'];
    for (const name of required) {
      if (typeof dependencies[name] !== 'function') {
        throw new Error(`Dependency "${name}" must be a function`);
      }
    }
  }

  return async function handleRequest(event, context) {
    console.log('Patient details request received');

    try {
      requireAuthentication(event);

      const tableName = process.env.PATIENTS_TABLE_NAME;
      const indexName = process.env.PATIENTS_QUEUE_INDEX_NAME;

      // Validate table and GSI configuration early
      if (!tableName || tableName.trim() === '' || !indexName || indexName.trim() === '') {
        throw new ApiError('CONFIGURATION_ERROR', 500, 'Database configurations are missing');
      }

      const patientId = event?.pathParameters?.patientId;

      const client = dependencies.getDocClientFn ? dependencies.getDocClientFn() : null;
      const deps = {
        getPatientDetailsFn: dependencies.getPatientDetailsFn || (dependencies.getDocClientFn ? (async (id) => {
          return await getPatientDetails(client, tableName, id);
        }) : null),
        countPeopleAheadFn: dependencies.countPeopleAheadFn || (dependencies.getDocClientFn ? (async (dateStr, createdAt, patientId) => {
          return await countPeopleAhead(client, tableName, indexName, { dateStr, createdAt, patientId });
        }) : null)
      };

      const serviceFn = dependencies.serviceFn;
      const result = await serviceFn(patientId, deps);

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
  serviceFn: getPatientService,
  getDocClientFn: getDocClient,
  getPatientDetailsFn: getPatientDetails,
  countPeopleAheadFn: countPeopleAhead
});

export const handler = createHandler(prodDeps);
