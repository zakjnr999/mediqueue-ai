import { validateStatsQuery } from '../validation/validate-stats-query.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to retrieve the patient queue summary statistics for a given date.
 * Computes active inQueue count, average wait time in minutes, redFlags count, and completed count.
 * 
 * @param {object} queryParams - Raw query parameters from the HTTP request
 * @param {object} deps - Injected dependencies for testability
 * @param {Function} deps.queryAllPatientsForDateFn - (dateStr) => Promise<Array>
 * @param {Function} [deps.nowFn] - () => Date
 * @returns {Promise<object>} The aggregated queue stats payload
 * @throws {ApiError}
 */
export async function getStatsService(queryParams, deps = {}) {
  const { queryAllPatientsForDateFn, nowFn } = deps;

  if (!queryAllPatientsForDateFn) {
    throw new ApiError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Validate parameters
  const normalized = validateStatsQuery(queryParams);

  // 2. Adjust UTC date fallback to support nowFn injection
  if (queryParams.date === undefined || queryParams.date === null) {
    const now = nowFn ? nowFn() : new Date();
    normalized.date = now.toISOString().slice(0, 10);
  }

  // 3. Retrieve all patients for the given date
  let patients;
  try {
    patients = await queryAllPatientsForDateFn(normalized.date);
  } catch (err) {
    throw err;
  }

  // 4. Compute statistics
  let totalWaitTimeMs = 0;
  let seenCount = 0;
  let inQueue = 0;
  let redFlags = 0;
  let seenToday = 0;

  for (const item of patients) {
    if (!item || item.entityType !== 'PATIENT_CHECKIN') {
      continue;
    }

    const status = item.status || 'WAITING';

    if (status === 'WAITING' || status === 'IN_PROGRESS') {
      inQueue++;
      const ai = item.aiAssessment || {};
      const flags = Array.isArray(ai.redFlags) ? ai.redFlags : [];
      if (flags.length > 0) {
        redFlags++;
      }
    } else if (status === 'COMPLETED') {
      seenToday++;
    }

    if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
      seenCount++;
      const created = Date.parse(item.createdAt);
      const updated = Date.parse(item.updatedAt);
      if (!isNaN(created) && !isNaN(updated) && updated >= created) {
        totalWaitTimeMs += (updated - created);
      }
    }
  }

  const avgWaitTimeMinutes = seenCount > 0 ? Math.round(totalWaitTimeMs / (seenCount * 60000)) : 0;

  // 5. Return aggregated stats
  return {
    date: normalized.date,
    inQueue,
    avgWaitTimeMinutes,
    redFlags,
    seenToday
  };
}
