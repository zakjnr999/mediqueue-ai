import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getPatientService } from '../services/get-patient-service.mjs';
import { getPatientDetails } from '../repositories/patient-repository.mjs';
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
 * AWS Lambda Handler for GET /patients/{patientId}.
 * 
 * @param {object} event - API Gateway Proxy Event
 * @param {object} [injectedDeps] - Optional injected dependencies for testing
 * @returns {Promise<object>} API Gateway Proxy Response
 */
export async function handler(event, injectedDeps = null) {
  console.log('Patient details request received');

  try {
    const tableName = process.env.PATIENTS_TABLE_NAME;

    // Validate table configuration early
    if (!tableName || tableName.trim() === '') {
      throw new ApiError('CONFIGURATION_ERROR', 500, 'Database configurations are missing');
    }

    const patientId = event?.pathParameters?.patientId;

    const client = injectedDeps ? null : getDocClient();
    const deps = injectedDeps || {
      getPatientDetailsFn: async (id) => {
        const item = await getPatientDetails(client, tableName, id);
        console.log(`Patient record retrieved: ${id}`);
        return item;
      }
    };

    const result = await getPatientService(patientId, deps);

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
