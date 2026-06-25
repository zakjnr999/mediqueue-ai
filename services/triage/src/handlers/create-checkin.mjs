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
 * Factory function to create check-in Lambda handler.
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
    // Only the deps that cannot be built from getDocClientFn must be supplied
    const required = ['analyseSymptomsFn', 'generateIdFn', 'nowFn'];
    for (const name of required) {
      if (typeof dependencies[name] !== 'function') {
        throw new Error(`Dependency "${name}" must be a function`);
      }
    }
  }

  return async function handleRequest(event, context) {
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

      const client = dependencies.getDocClientFn ? dependencies.getDocClientFn() : null;
      const tableName = process.env.PATIENTS_TABLE_NAME;
      const indexName = process.env.PATIENTS_QUEUE_INDEX_NAME;

      const deps = {
        analyseSymptomsFn: dependencies.analyseSymptomsFn || (dependencies.getDocClientFn ? (async (symptomsData) => {
          const assessment = await analyseSymptoms(symptomsData);
          console.log('Triage completed');
          return assessment;
        }) : null),
        generateQueueNumberFn: dependencies.generateQueueNumberFn || (dependencies.getDocClientFn ? (async (dateStr, nowIso) => {
          const queueNumber = await generateQueueNumber(client, tableName, dateStr, nowIso);
          console.log('Queue number generated');
          return queueNumber;
        }) : null),
        savePatientFn: dependencies.savePatientFn || (dependencies.getDocClientFn ? (async (item) => {
          await savePatientCheckin(client, tableName, item);
          console.log(`Patient record stored: ${item.patientId}`);
        }) : null),
        countPeopleAheadFn: dependencies.countPeopleAheadFn || (dependencies.getDocClientFn ? (async (dateStr, createdAt, patientId) => {
          return await countPeopleAhead(client, tableName, indexName, { dateStr, createdAt, patientId });
        }) : null),
        generateIdFn: dependencies.generateIdFn || (() => crypto.randomUUID()),
        nowFn: dependencies.nowFn || (() => new Date())
      };

      const serviceFn = dependencies.serviceFn;
      const result = await serviceFn(body, deps);

      return apiResponse(201, {
        success: true,
        data: result
      });
    } catch (err) {
      if (err instanceof CheckinError) {
        // Suppress internal implementation details from client-facing messages.
        // Infrastructure errors (e.g. QUEUE_NUMBER_ERROR, DATABASE_ERROR) may contain
        // raw AWS messages, table names, or function signatures — return a safe
        // generic message for those categories while keeping stable error codes.
        const SAFE_INTERNAL_CODES = new Set([
          'QUEUE_NUMBER_ERROR',
          'DATABASE_ERROR',
          'TRIAGE_PROCESSING_ERROR'
        ]);
        const safeMessage = SAFE_INTERNAL_CODES.has(err.code)
          ? 'Unable to complete patient check-in'
          : err.message;

        console.warn("Request failed", {
          code: err.code,
          requestId: context?.awsRequestId,
        });
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

// Production dependencies.
// analyseSymptomsFn is injected directly — its signature (symptomsData) already
// matches the service-facing contract.
//
// generateQueueNumberFn, savePatientFn, and countPeopleAheadFn are intentionally
// NOT provided here. The handler's internal adapter wrappers (lines 77-88) will
// build correctly-bound closures from getDocClientFn, PATIENTS_TABLE_NAME, and
// PATIENTS_QUEUE_INDEX_NAME at invocation time.
//
// Injecting the raw repository functions directly would bypass those wrappers
// (due to the || short-circuit) and cause infrastructure arguments such as
// docClient and tableName to be missing — producing errors like:
//   "docClient.send is not a function"
const prodDeps = Object.freeze({
  serviceFn: createCheckinService,
  getDocClientFn: getDocClient,
  analyseSymptomsFn: analyseSymptoms,
  generateIdFn: () => crypto.randomUUID(),
  nowFn: () => new Date()
});

export const handler = createHandler(prodDeps);
