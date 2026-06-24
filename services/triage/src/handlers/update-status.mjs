import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { updateStatusService } from '../services/update-status-service.mjs';
import { getPatientDetails, updatePatientStatus } from '../repositories/patient-repository.mjs';
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
 * AWS Lambda Handler for PATCH /patients/{patientId}/status.
 * 
 * @param {object} event - API Gateway Proxy Event
 * @param {object} [injectedDeps] - Optional injected dependencies for testing
 * @returns {Promise<object>} API Gateway Proxy Response
 */
export async function handler(event, injectedDeps = null) {
  console.log('Status update request received');

  try {
    requireAuthentication(event);

    const tableName = process.env.PATIENTS_TABLE_NAME;

    // Validate table configuration early
    if (!tableName || tableName.trim() === '') {
      throw new ApiError('CONFIGURATION_ERROR', 500, 'Database configurations are missing');
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

    const client = injectedDeps ? null : getDocClient();
    const deps = injectedDeps || {
      getPatientDetailsFn: async (id) => {
        return await getPatientDetails(client, tableName, id);
      },
      updatePatientStatusFn: async (id, params) => {
        const updated = await updatePatientStatus(client, tableName, id, params);
        console.log('Patient status updated');
        return updated;
      },
      nowFn: () => new Date()
    };

    const result = await updateStatusService(patientId, parsedBody, deps);

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

    // Secure logging - no raw error, cause, stack trace, or payload leaks
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
