import { validatePatientId } from '../validation/validate-patient-id.mjs';
import { validateStatusUpdate } from '../validation/validate-status-update.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to review and update patient status.
 * 
 * @param {string} patientId - Patient UUID
 * @param {object} body - Request body
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.getPatientDetailsFn - (id) => Promise<patient|null>
 * @param {Function} deps.updatePatientStatusFn - (id, params) => Promise<updatedPatient>
 * @param {Function} [deps.nowFn] - () => Date
 * @returns {Promise<object>} Map of approved public patient properties
 * @throws {ApiError}
 */
export async function updateStatusService(patientId, body, deps = {}) {
  const { getPatientDetailsFn, updatePatientStatusFn, nowFn } = deps;

  if (!getPatientDetailsFn || !updatePatientStatusFn) {
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

  const currentStatus = patient.status;

  // 5. Input validation & normalization (does not mutate request body)
  const normalizedInput = validateStatusUpdate(body);
  const newStatus = normalizedInput.status;

  // 6. Validate status transition rules
  if (currentStatus === newStatus) {
    throw new ApiError('INVALID_STATUS_TRANSITION', 409, 'Patient is already in the requested status');
  }

  const isValidTransition = 
    (currentStatus === 'WAITING' && newStatus === 'IN_PROGRESS') ||
    (currentStatus === 'IN_PROGRESS' && newStatus === 'COMPLETED');

  if (!isValidTransition) {
    throw new ApiError('INVALID_STATUS_TRANSITION', 409, `Invalid status transition from ${currentStatus} to ${newStatus}`);
  }

  // 7. Injected timestamps
  const now = nowFn ? nowFn() : new Date();
  const timestampStr = now.toISOString();

  // 8. Call update function with race-condition check (status = expectedCurrentStatus)
  const updatedItem = await updatePatientStatusFn(normalizedId, {
    newStatus,
    expectedCurrentStatus: currentStatus,
    updatedAt: timestampStr
  });

  // 9. Explicit mapping of public fields (never spreading)
  return {
    patientId: updatedItem.patientId || '',
    queueNumber: updatedItem.queueNumber || '',
    status: updatedItem.status || 'WAITING',
    updatedAt: updatedItem.updatedAt || ''
  };
}
