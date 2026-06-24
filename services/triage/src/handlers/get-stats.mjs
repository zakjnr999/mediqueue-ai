import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getStatsService } from '../services/get-stats-service.mjs';
import { queryAllPatientsForDate } from '../repositories/patient-repository.mjs';
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
 * AWS Lambda Handler for GET /queue/stats.
 * 
 * @param {object} event - API Gateway Proxy Event
 * @param {object} [injectedDeps] - Optional injected dependencies for testing
 * @returns {Promise<object>} API Gateway Proxy Response
 */
export async function handler(event, injectedDeps = null) {
  console.log('Stats request received');

  try {
    const tableName = process.env.PATIENTS_TABLE_NAME;
    const indexName = process.env.PATIENTS_QUEUE_INDEX_NAME;

    // Validate table/index configuration early
    if (!tableName || tableName.trim() === '' || !indexName || indexName.trim() === '') {
      throw new ApiError('CONFIGURATION_ERROR', 500, 'Database configurations are missing');
    }

    const queryParams = event?.queryStringParameters || {};

    const client = injectedDeps ? null : getDocClient();
    const deps = injectedDeps || {
      queryAllPatientsForDateFn: async (dateStr) => {
        const results = await queryAllPatientsForDate(client, tableName, indexName, dateStr);
        console.log('Patients retrieved for stats');
        return results;
      },
      nowFn: () => new Date()
    };

    const result = await getStatsService(queryParams, deps);

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
