import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import crypto from 'node:crypto';
import { createCheckinService } from '../services/create-checkin-service.mjs';
import { analyseSymptoms } from '../bedrock/analyse-symptoms.mjs';
import { generateQueueNumber } from '../queue/generate-queue-number.mjs';
import { savePatientCheckin, countPeopleAhead } from '../repositories/patient-repository.mjs';
import { CheckinError } from '../errors/checkin-error.mjs';
import { apiResponse } from '../responses/api-response.mjs';

// Lazy instantiation of DynamoDB client
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
 * AWS Lambda Handler for patient check-ins.
 * 
 * @param {object} event - API Gateway Proxy Event
 * @param {object} [injectedDeps] - Optional injected dependencies for offline testing
 * @returns {Promise<object>} API Gateway Proxy Response
 */
export async function handler(event, injectedDeps = null) {
  console.log('Check-in request received');

  try {
    if (!event || event.body === undefined || event.body === null) {
      throw new CheckinError('INVALID_JSON', 400, 'Request body is missing');
    }

    let body;
    try {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (err) {
      throw new CheckinError('INVALID_JSON', 400, 'Request body is not valid JSON', err);
    }

    const tableName = process.env.PATIENTS_TABLE_NAME;
    const indexName = process.env.PATIENTS_QUEUE_INDEX_NAME;

    const client = injectedDeps ? null : getDocClient();
    const deps = injectedDeps || {
      analyseSymptomsFn: async (symptomsData) => {
        const assessment = await analyseSymptoms(symptomsData);
        console.log('Triage completed');
        return assessment;
      },
      generateQueueNumberFn: async (dateStr, nowIso) => {
        const queueNumber = await generateQueueNumber(client, tableName, dateStr, nowIso);
        console.log('Queue number generated');
        return queueNumber;
      },
      savePatientFn: async (item) => {
        await savePatientCheckin(client, tableName, item);
        console.log(`Patient record stored: ${item.patientId}`);
      },
      countPeopleAheadFn: async (dateStr, createdAt, patientId) => {
        return await countPeopleAhead(client, tableName, indexName, { dateStr, createdAt, patientId });
      },
      generateIdFn: () => crypto.randomUUID(),
      nowFn: () => new Date()
    };

    const result = await createCheckinService(body, deps);

    return apiResponse(201, {
      success: true,
      data: result
    });
  } catch (err) {
    if (err instanceof CheckinError) {
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
