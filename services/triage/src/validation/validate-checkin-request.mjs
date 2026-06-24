import { CheckinError } from '../errors/checkin-error.mjs';

/**
 * Validates the check-in request payload and returns a new normalized object.
 * Rejects unexpected properties and checks string lengths, values, and array sizes.
 * 
 * @param {any} body
 * @returns {object} Normalized patient request details
 * @throws {CheckinError}
 */
export function validateCheckinRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Request body must be a valid JSON object');
  }

  // Reject unexpected top-level request properties
  const allowedKeys = ['fullName', 'age', 'phoneNumber', 'symptoms', 'additionalDetails', 'sex', 'selfAssessedUrgency'];
  const actualKeys = Object.keys(body);
  for (const key of actualKeys) {
    if (!allowedKeys.includes(key)) {
      throw new CheckinError('VALIDATION_ERROR', 400, `Unexpected request property: "${key}"`);
    }
  }

  const normalized = {};

  // Validate fullName
  if (body.fullName === undefined || body.fullName === null) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "fullName" is required');
  }
  if (typeof body.fullName !== 'string') {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "fullName" must be a string');
  }
  const trimmedName = body.fullName.trim();
  if (trimmedName === '') {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "fullName" cannot be empty');
  }
  if (trimmedName.length > 100) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "fullName" exceeds maximum length of 100 characters');
  }
  normalized.fullName = trimmedName;

  // Validate age
  if (body.age === undefined || body.age === null) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "age" is required');
  }
  if (!Number.isInteger(body.age) || body.age < 0 || body.age > 120) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "age" must be an integer between 0 and 120');
  }
  normalized.age = body.age;

  // Validate phoneNumber (optional)
  if (body.phoneNumber !== undefined && body.phoneNumber !== null) {
    if (typeof body.phoneNumber !== 'string') {
      throw new CheckinError('VALIDATION_ERROR', 400, 'Field "phoneNumber" must be a string');
    }
    const trimmedPhone = body.phoneNumber.trim();
    if (trimmedPhone !== '') {
      if (trimmedPhone.length > 30) {
        throw new CheckinError('VALIDATION_ERROR', 400, 'Field "phoneNumber" exceeds maximum length of 30 characters');
      }
      normalized.phoneNumber = trimmedPhone;
    }
  }

  // Validate symptoms
  if (body.symptoms === undefined || body.symptoms === null) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "symptoms" is required');
  }
  if (!Array.isArray(body.symptoms)) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "symptoms" must be an array');
  }
  if (body.symptoms.length === 0) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "symptoms" array cannot be empty');
  }
  if (body.symptoms.length > 20) {
    throw new CheckinError('VALIDATION_ERROR', 400, 'Field "symptoms" exceeds maximum size of 20');
  }

  normalized.symptoms = [];
  for (let i = 0; i < body.symptoms.length; i++) {
    const symptom = body.symptoms[i];
    if (typeof symptom !== 'string') {
      throw new CheckinError('VALIDATION_ERROR', 400, `Symptom at index ${i} must be a string`);
    }
    const trimmedSymptom = symptom.trim();
    if (trimmedSymptom === '') {
      throw new CheckinError('VALIDATION_ERROR', 400, `Symptom at index ${i} cannot be empty`);
    }
    if (trimmedSymptom.length > 100) {
      throw new CheckinError('VALIDATION_ERROR', 400, `Symptom at index ${i} exceeds maximum length of 100 characters`);
    }
    normalized.symptoms.push(trimmedSymptom);
  }

  // Validate additionalDetails (optional)
  if (body.additionalDetails !== undefined && body.additionalDetails !== null) {
    if (typeof body.additionalDetails !== 'string') {
      throw new CheckinError('VALIDATION_ERROR', 400, 'Field "additionalDetails" must be a string');
    }
    const trimmedDetails = body.additionalDetails.trim();
    if (trimmedDetails !== '') {
      if (trimmedDetails.length > 1000) {
        throw new CheckinError('VALIDATION_ERROR', 400, 'Field "additionalDetails" exceeds maximum length of 1000 characters');
      }
      normalized.additionalDetails = trimmedDetails;
    }
  }

  // Validate sex (optional)
  const ALLOWED_SEX_VALUES = ['Male', 'Female', 'Prefer not to say'];
  if (body.sex !== undefined && body.sex !== null) {
    if (typeof body.sex !== 'string') {
      throw new CheckinError('VALIDATION_ERROR', 400, 'Field "sex" must be a string');
    }
    const trimmedSex = body.sex.trim();
    if (!ALLOWED_SEX_VALUES.includes(trimmedSex)) {
      throw new CheckinError('VALIDATION_ERROR', 400, 'Field "sex" must be one of: Male, Female, Prefer not to say');
    }
    normalized.sex = trimmedSex;
  }

  // Validate selfAssessedUrgency (optional)
  const ALLOWED_URGENCY_VALUES = ['Minor', 'Moderate', 'Urgent'];
  if (body.selfAssessedUrgency !== undefined && body.selfAssessedUrgency !== null) {
    if (typeof body.selfAssessedUrgency !== 'string') {
      throw new CheckinError('VALIDATION_ERROR', 400, 'Field "selfAssessedUrgency" must be a string');
    }
    const trimmedUrgency = body.selfAssessedUrgency.trim();
    if (!ALLOWED_URGENCY_VALUES.includes(trimmedUrgency)) {
      throw new CheckinError('VALIDATION_ERROR', 400, 'Field "selfAssessedUrgency" must be one of: Minor, Moderate, Urgent');
    }
    normalized.selfAssessedUrgency = trimmedUrgency;
  }

  return normalized;
}
