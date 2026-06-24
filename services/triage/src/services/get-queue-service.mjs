import { validateQueueQuery } from '../validation/validate-queue-query.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to retrieve the patient check-in queue for a given date.
 * Filters out GSI/counter items and limits returns to staff dashboard fields.
 * 
 * @param {object} queryParams - Raw query parameters from the HTTP request
 * @param {object} deps - Injected dependencies for testability
 * @param {Function} deps.queryPatientQueueFn - (params) => Promise<{items, lastEvaluatedKey}>
 * @param {Function} deps.serializeTokenFn - (key, date, filters) => string
 * @param {Function} deps.deserializeTokenFn - (token, date, requestedFilters) => object
 * @param {Function} [deps.nowFn] - () => Date
 * @returns {Promise<object>} Staff queue payload
 * @throws {ApiError}
 */
export async function getQueueService(queryParams, deps = {}) {
  const { queryPatientQueueFn, serializeTokenFn, deserializeTokenFn, nowFn } = deps;

  if (!queryPatientQueueFn || !serializeTokenFn || !deserializeTokenFn) {
    throw new ApiError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Validate parameters and get normalized object
  const normalized = validateQueueQuery(queryParams);

  // 2. Adjust UTC date fallback to support nowFn injection
  if (queryParams.date === undefined || queryParams.date === null) {
    const now = nowFn ? nowFn() : new Date();
    normalized.date = now.toISOString().slice(0, 10);
  }

  // 3. Build filter context for pagination binding
  const requestedFilters = {};
  if (normalized.status !== null) {
    requestedFilters.status = normalized.status;
  }
  if (normalized.hasRedFlags !== null) {
    requestedFilters.hasRedFlags = normalized.hasRedFlags;
  }

  // 4. Deserialize token if present (passes filter context for validation)
  let exclusiveStartKey = null;
  if (normalized.nextToken) {
    exclusiveStartKey = deserializeTokenFn(normalized.nextToken, normalized.date, requestedFilters);
  }

  // 5. Query patient repository
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

  // 6. Filter and map items
  const filteredPatients = results.items
    .filter(item => item && item.entityType === 'PATIENT_CHECKIN')
    // Apply in-memory status filter if requested
    .filter(item => {
      if (normalized.status === null) return true;
      return item.status === normalized.status;
    })
    // Apply in-memory hasRedFlags filter if requested
    .filter(item => {
      if (normalized.hasRedFlags === null) return true;
      const ai = item.aiAssessment || {};
      const redFlags = Array.isArray(ai.redFlags) ? ai.redFlags : [];
      if (normalized.hasRedFlags === true) {
        return redFlags.length > 0;
      }
      return redFlags.length === 0;
    })
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

  // 7. Serialize lastEvaluatedKey into opaque nextToken (includes active filter context)
  const nextToken = serializeTokenFn(results.lastEvaluatedKey, normalized.date, requestedFilters);

  return {
    date: normalized.date,
    patients: filteredPatients,
    nextToken
  };
}
