import { validatePatientId } from '../validation/validate-patient-id.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to retrieve patient check-in details.
 * 
 * @param {string} patientId - Raw patient UUID path parameter
 * @param {object} deps - Injected dependencies for testability
 * @param {Function} deps.getPatientDetailsFn - (id) => Promise<item|null>
 * @returns {Promise<object>} Staff details payload
 * @throws {ApiError}
 */
export async function getPatientService(patientId, deps = {}) {
  const { getPatientDetailsFn } = deps;

  if (!getPatientDetailsFn) {
    throw new ApiError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Validate UUID
  const normalizedId = validatePatientId(patientId);

  // 2. Fetch patient item
  let item;
  try {
    item = await getPatientDetailsFn(normalizedId);
  } catch (err) {
    throw err;
  }

  // 3. Confirm entityType
  if (!item || item.entityType !== 'PATIENT_CHECKIN') {
    throw new ApiError('PATIENT_NOT_FOUND', 404, 'Patient check-in record not found');
  }

  // 4. Map output format explicitly (retaining strict separation between AI and staff priorities)
  const ai = item.aiAssessment || {};
  const sd = item.staffDecision || {};

  const payload = {
    patientId: item.patientId || '',
    queueNumber: item.queueNumber || '',
    fullName: item.fullName || '',
    age: typeof item.age === 'number' ? item.age : 0,
    symptoms: Array.isArray(item.symptoms) ? item.symptoms : [],
    aiAssessment: {
      summary: ai.summary || '',
      redFlags: Array.isArray(ai.redFlags) ? ai.redFlags : [],
      suggestedPriority: ai.suggestedPriority || 'MEDIUM',
      reason: ai.reason || '',
      requiresImmediateStaffReview: typeof ai.requiresImmediateStaffReview === 'boolean' ? ai.requiresImmediateStaffReview : true
    },
    staffDecision: {
      confirmedPriority: sd.confirmedPriority !== undefined ? sd.confirmedPriority : null,
      reviewedBy: sd.reviewedBy !== undefined ? sd.reviewedBy : null,
      reviewedAt: sd.reviewedAt !== undefined ? sd.reviewedAt : null,
      overrideReason: sd.overrideReason !== undefined ? sd.overrideReason : null,
      reviewerDisplayName: sd.reviewerDisplayName !== undefined ? sd.reviewerDisplayName : null
    },
    status: item.status || 'WAITING',
    createdAt: item.createdAt || '',
    updatedAt: item.updatedAt || ''
  };

  // Safe optional fields handling - omit consistently if absent
  if (item.phoneNumber !== undefined && item.phoneNumber !== null) {
    payload.phoneNumber = item.phoneNumber;
  }
  if (item.additionalDetails !== undefined && item.additionalDetails !== null) {
    payload.additionalDetails = item.additionalDetails;
  }
  // Sensitive patient fields - included in patient details only, never in queue list
  if (item.sex !== undefined && item.sex !== null) {
    payload.sex = item.sex;
  }
  if (item.selfAssessedUrgency !== undefined && item.selfAssessedUrgency !== null) {
    payload.selfAssessedUrgency = item.selfAssessedUrgency;
  }

  return payload;
}
