import { validatePatientId } from '../validation/validate-patient-id.mjs';
import { validateEscalationRequest } from '../validation/validate-escalation-request.mjs';
import { ApiError } from '../errors/api-error.mjs';

/**
 * Service to review and escalate a patient check-in ticket.
 * Sets isEscalated to true and updates confirmedPriority to HIGH.
 * 
 * @param {string} patientId - Patient UUID
 * @param {object} body - Request body
 * @param {object} deps - Injected dependencies
 * @param {Function} deps.getPatientDetailsFn - (id) => Promise<patient|null>
 * @param {Function} deps.escalatePatientFn - (id, params) => Promise<updatedPatient>
 * @param {Function} [deps.nowFn] - () => Date
 * @returns {Promise<object>} Mapped public patient fields
 * @throws {ApiError}
 */
export async function escalatePatientService(patientId, body, deps = {}) {
  const { getPatientDetailsFn, escalatePatientFn, nowFn } = deps;

  if (!getPatientDetailsFn || !escalatePatientFn) {
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

  // 4. Verify patient status is WAITING (only WAITING patients can be escalated)
  if (patient.status !== 'WAITING') {
    throw new ApiError('INVALID_STATUS_TRANSITION', 409, 'Only patients in WAITING status can be escalated');
  }

  // 5. Input validation & normalization
  const normalizedInput = validateEscalationRequest(body);

  // 6. Injected timestamps
  const now = nowFn ? nowFn() : new Date();
  const timestampStr = now.toISOString();

  // 7. Call escalate function with concurrency check
  const updatedItem = await escalatePatientFn(normalizedId, {
    reviewerDisplayName: normalizedInput.reviewerDisplayName,
    reviewedAt: timestampStr,
    expectedUpdatedAt: patient.updatedAt,
    updatedAt: timestampStr
  });

  // 8. Explicit mapping of public fields
  return {
    patientId: updatedItem.patientId || '',
    queueNumber: updatedItem.queueNumber || '',
    isEscalated: true,
    escalatedBy: updatedItem.escalatedBy || '',
    staffDecision: {
      confirmedPriority: updatedItem.staffDecision?.confirmedPriority || 'HIGH',
      reviewedAt: updatedItem.staffDecision?.reviewedAt || null,
      overrideReason: updatedItem.staffDecision?.overrideReason || null,
      reviewerDisplayName: updatedItem.staffDecision?.reviewerDisplayName || null
    },
    status: updatedItem.status || 'WAITING',
    updatedAt: updatedItem.updatedAt || ''
  };
}
