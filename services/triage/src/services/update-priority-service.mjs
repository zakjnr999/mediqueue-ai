import { validatePatientId } from '../validation/validate-patient-id.mjs';
import { validatePriorityUpdate } from '../validation/validate-priority-update.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to review and update patient priority.
 * 
 * @param {string} patientId - Patient UUID
 * @param {object} body - Request body
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.getPatientDetailsFn - (id) => Promise<patient|null>
 * @param {Function} deps.updatePatientPriorityFn - (id, params) => Promise<updatedPatient>
 * @param {Function} [deps.nowFn] - () => Date
 * @returns {Promise<object>} Map of approved public patient properties
 * @throws {ApiError}
 */
export async function updatePriorityService(patientId, body, deps = {}) {
  const { getPatientDetailsFn, updatePatientPriorityFn, nowFn } = deps;

  if (!getPatientDetailsFn || !updatePatientPriorityFn) {
    throw new ApiError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Validate parameter patientId
  const normalizedId = validatePatientId(patientId);

  // 2. Consistent read
  const patient = await getPatientDetailsFn(normalizedId);

  // 3. Verify record exists and has correct entityType
  if (!patient || patient.entityType !== 'PATIENT_CHECKIN') {
    throw new ApiError('PATIENT_NOT_FOUND', 404, 'Patient check-in record not found');
  }

  // 4. Validate stored record structure
  const hasValidAi = patient.aiAssessment && 
    (patient.aiAssessment.suggestedPriority === 'HIGH' || 
     patient.aiAssessment.suggestedPriority === 'MEDIUM' || 
     patient.aiAssessment.suggestedPriority === 'LOW');
  
  const hasValidStaffDecision = patient.staffDecision && typeof patient.staffDecision === 'object';
  const hasValidStatus = patient.status === 'WAITING' || patient.status === 'IN_PROGRESS' || patient.status === 'COMPLETED';
  const hasValidUpdatedAt = typeof patient.updatedAt === 'string' && patient.updatedAt.trim() !== '';

  if (!hasValidAi || !hasValidStaffDecision || !hasValidStatus || !hasValidUpdatedAt) {
    // Malformed DB record - fail safely with a clean INTERNAL_ERROR message
    throw new ApiError('INTERNAL_ERROR', 500, 'An unexpected internal error occurred');
  }

  const suggestedPriority = patient.aiAssessment.suggestedPriority;

  // 5. Input validation & normalization (does not mutate request body)
  const normalizedInput = validatePriorityUpdate(body, suggestedPriority);

  // 6. Injected timestamps
  const now = nowFn ? nowFn() : new Date();
  const timestampStr = now.toISOString();

  // 7. Call update function with concurrency safety check (updatedAt = expectedUpdatedAt)
  const updatedItem = await updatePatientPriorityFn(normalizedId, {
    confirmedPriority: normalizedInput.confirmedPriority,
    overrideReason: normalizedInput.overrideReason,
    reviewerDisplayName: normalizedInput.reviewerDisplayName,
    reviewedAt: timestampStr,
    expectedUpdatedAt: patient.updatedAt,
    updatedAt: timestampStr
  });

  // 8. Explicit mapping of public fields (never spreading)
  return {
    patientId: updatedItem.patientId || '',
    queueNumber: updatedItem.queueNumber || '',
    aiSuggestedPriority: suggestedPriority,
    staffDecision: {
      confirmedPriority: updatedItem.staffDecision?.confirmedPriority || null,
      reviewedAt: updatedItem.staffDecision?.reviewedAt || null,
      overrideReason: updatedItem.staffDecision?.overrideReason !== undefined ? updatedItem.staffDecision.overrideReason : null,
      reviewerDisplayName: updatedItem.staffDecision?.reviewerDisplayName !== undefined ? updatedItem.staffDecision.reviewerDisplayName : null
    },
    status: updatedItem.status || 'WAITING',
    updatedAt: updatedItem.updatedAt || ''
  };
}
