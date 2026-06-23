import crypto from 'node:crypto';
import { validateCheckinRequest } from '../validation/validate-checkin-request.mjs';
import { CheckinError } from '../errors/checkin-error.mjs';

/**
 * Business service to orchestrate a patient check-in.
 * 
 * @param {object} rawRequest - Unvalidated request body
 * @param {object} deps - Injected operations for testability
 * @param {Function} deps.analyseSymptomsFn - (symptomsData) => Promise<assessment>
 * @param {Function} deps.generateQueueNumberFn - (dateStr, nowIso) => Promise<queueNumber>
 * @param {Function} deps.savePatientFn - (item) => Promise<void>
 * @param {Function} deps.generateIdFn - () => string (uuid)
 * @param {Function} deps.nowFn - () => Date
 * @returns {Promise<object>} The stored record response format
 * @throws {CheckinError}
 */
export async function createCheckinService(rawRequest, deps = {}) {
  const {
    analyseSymptomsFn,
    generateQueueNumberFn,
    savePatientFn,
    generateIdFn,
    nowFn
  } = deps;

  if (!analyseSymptomsFn || !generateQueueNumberFn || !savePatientFn) {
    throw new CheckinError('INTERNAL_ERROR', 500, 'Required operations not injected into service');
  }

  // 1. Validate request and get normalized object
  const normalized = validateCheckinRequest(rawRequest);

  // 2. Call Bedrock triage passing ONLY age, symptoms, and additionalDetails (No PII)
  let assessment;
  try {
    assessment = await analyseSymptomsFn({
      age: normalized.age,
      symptoms: normalized.symptoms,
      additionalDetails: normalized.additionalDetails
    });
  } catch (err) {
    if (err instanceof CheckinError) {
      throw err;
    }
    throw new CheckinError(
      'TRIAGE_PROCESSING_ERROR',
      500,
      `Symptom analysis failed: ${err.message}`,
      err
    );
  }

  // 3. Generate date and time parameters in UTC
  const now = nowFn ? nowFn() : new Date();
  const nowIso = now.toISOString();

  // YYYY-MM-DD
  const queueDate = nowIso.slice(0, 10);
  // YYYYMMDD
  const dateStr = queueDate.replace(/-/g, '');

  // 4. Generate unique patientId
  const patientId = generateIdFn ? generateIdFn() : crypto.randomUUID();

  // 5. Generate queue number
  let queueNumber;
  try {
    queueNumber = await generateQueueNumberFn(dateStr, nowIso);
  } catch (err) {
    throw err;
  }

  // 6. Build the DynamoDB patient item structure
  const item = {
    id: `PATIENT#${patientId}`,
    entityType: 'PATIENT_CHECKIN',
    patientId: patientId,
    queueNumber: queueNumber,
    fullName: normalized.fullName,
    age: normalized.age,
    symptoms: normalized.symptoms,
    queueDate: queueDate,
    gsi1pk: `QUEUE#${queueDate}`,
    gsi1sk: `${nowIso}#${patientId}`,
    aiAssessment: {
      summary: assessment.summary,
      redFlags: assessment.redFlags,
      suggestedPriority: assessment.suggestedPriority,
      reason: assessment.reason,
      requiresImmediateStaffReview: assessment.requiresImmediateStaffReview
    },
    staffDecision: {
      confirmedPriority: null,
      reviewedBy: null,
      reviewedAt: null,
      overrideReason: null
    },
    status: 'WAITING',
    createdAt: nowIso,
    updatedAt: nowIso
  };

  // Safe optional fields handling - omit if absent
  if (normalized.phoneNumber !== undefined) {
    item.phoneNumber = normalized.phoneNumber;
  }
  if (normalized.additionalDetails !== undefined) {
    item.additionalDetails = normalized.additionalDetails;
  }

  // 7. Save item using savePatientFn
  try {
    await savePatientFn(item);
  } catch (err) {
    throw err;
  }

  // 8. Return response payload
  return {
    patientId: patientId,
    queueNumber: queueNumber,
    status: 'WAITING',
    aiAssessment: item.aiAssessment,
    createdAt: nowIso
  };
}
