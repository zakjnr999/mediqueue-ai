import { validateQueueQuery } from '../validation/validate-queue-query.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to retrieve the patient check-in queue for a given date.
 * Filters out GSI/counter items and limits returns to staff dashboard fields.
 * 
 * @param {object} queryParams - Raw query parameters from the HTTP request
 * @param {object} deps - Injected dependencies for testability
 * @param {Function} deps.queryPatientQueueFn - (params) => Promise<{items, lastEvaluatedKey}>
 * @param {Function} deps.serializeTokenFn - (key, date) => string
 * @param {Function} deps.deserializeTokenFn - (token, date) => object
 * @param {Function} [deps.nowFn] - () => Date
 * @returns {Promise<object>} Staff queue payload
 * @throws {ApiError}
 */
export async function getQueueService(queryParams, deps = {}) {
  const { queryPatientQueueFn, serializeTokenFn, deserializeTokenFn, nowFn } = deps;

  if (!queryPatientQueueFn || !serializeTokenFn || !deserializeTokenFn) {
    throw new ApiError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Validate parameters
  const normalized = validateQueueQuery(queryParams);

  // 2. Adjust UTC date fallback to support nowFn injection
  if (queryParams.date === undefined || queryParams.date === null) {
    const now = nowFn ? nowFn() : new Date();
    normalized.date = now.toISOString().slice(0, 10);
  }

  // 3. Deserialize token if present
  let exclusiveStartKey = null;
  if (normalized.nextToken) {
    exclusiveStartKey = deserializeTokenFn(normalized.nextToken, normalized.date);
  }

  // 4. Query patient repository
  let results;
  try {
    results = await queryPatientQueueFn({
      dateStr: normalized.date,
      limit: normalized.limit,
      exclusiveStartKey
    });
  } catch (err) {
    throw err;
  }

  // 5. Filter and map items
  const filteredPatients = results.items
    .filter(item => item && item.entityType === 'PATIENT_CHECKIN')
    .map(item => {
      // Safely fetch aiAssessment
      const ai = item.aiAssessment || {};
      const aiAssessment = {
        summary: ai.summary || '',
        redFlags: Array.isArray(ai.redFlags) ? ai.redFlags : [],
        suggestedPriority: ai.suggestedPriority || 'MEDIUM',
        requiresImmediateStaffReview: typeof ai.requiresImmediateStaffReview === 'boolean' ? ai.requiresImmediateStaffReview : true
      };

      // Safely fetch staffDecision
      const sd = item.staffDecision || {};
      const staffDecision = {
        confirmedPriority: sd.confirmedPriority !== undefined ? sd.confirmedPriority : null
      };

      // Construct exactly the approved response structure (no spread, no extra properties)
      return {
        patientId: item.patientId || '',
        queueNumber: item.queueNumber || '',
        fullName: item.fullName || '',
        age: typeof item.age === 'number' ? item.age : 0,
        status: item.status || 'WAITING',
        aiAssessment,
        staffDecision,
        createdAt: item.createdAt || ''
      };
    });

  // 6. Serialize lastEvaluatedKey into opaque nextToken
  const nextToken = serializeTokenFn(results.lastEvaluatedKey, normalized.date);

  return {
    date: normalized.date,
    patients: filteredPatients,
    nextToken
  };
}
