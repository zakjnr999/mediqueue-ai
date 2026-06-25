import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getStatsService } from '../services/get-stats-service.mjs';
import { queryAllPatientsForDate } from '../repositories/patient-repository.mjs';
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
 * Factory function to create GET /queue/stats Lambda handler.
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

  return async function handleRequest(event, context) {
    console.log('Stats request received');

    try {
      requireAuthentication(event);

      const tableName = process.env.PATIENTS_TABLE_NAME;
      const indexName = process.env.PATIENTS_QUEUE_INDEX_NAME;

      // Validate table/index configuration early
      if (!tableName || tableName.trim() === '' || !indexName || indexName.trim() === '') {
        throw new ApiError('CONFIGURATION_ERROR', 500, 'Unable to process request');
      }

      const queryParams = event?.queryStringParameters || {};

      const client = dependencies.getDocClientFn ? dependencies.getDocClientFn() : null;
      const deps = {
        queryAllPatientsForDateFn: dependencies.queryAllPatientsForDateFn || (dependencies.getDocClientFn ? (async (dateStr) => {
          return await queryAllPatientsForDate(client, tableName, indexName, dateStr);
        }) : null),
        nowFn: dependencies.nowFn || (() => new Date())
      };

      const serviceFn = dependencies.serviceFn;
      const result = await serviceFn(queryParams, deps);

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
        const safeMessage = (err.code === 'CONFIGURATION_ERROR' || err.code === 'DATABASE_ERROR')
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
  serviceFn: getStatsService,
  getDocClientFn: getDocClient,
  nowFn: () => new Date()
});

export const handler = createHandler(prodDeps);
