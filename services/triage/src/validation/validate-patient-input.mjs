import { TriageError } from '../errors/triage-error.mjs';

/**
 * Validates patient symptom input before sending to Bedrock.
 * @param {object} patientData
 */
export function validatePatientInput(patientData) {
  if (!patientData || typeof patientData !== 'object') {
    throw new TriageError('Patient data must be a valid object');
  }

  const { age, symptoms, additionalDetails } = patientData;

  // Validate Age
  if (age === undefined || age === null) {
    throw new TriageError('Age is required');
  }
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new TriageError('Age must be an integer between 0 and 120');
  }

  // Validate Symptoms
  if (!Array.isArray(symptoms)) {
    throw new TriageError('Symptoms must be an array');
  }
  if (symptoms.length === 0) {
    throw new TriageError('Symptoms array cannot be empty');
  }
  if (symptoms.length > 50) {
    throw new TriageError('Symptoms array exceeds maximum size of 50');
  }
  for (let i = 0; i < symptoms.length; i++) {
    const symptom = symptoms[i];
    if (typeof symptom !== 'string' || symptom.trim() === '') {
      throw new TriageError(`Symptom at index ${i} must be a non-empty string`);
    }
    if (symptom.length > 200) {
      throw new TriageError(`Symptom at index ${i} exceeds maximum length of 200 characters`);
    }
  }

  // Validate Additional Details
  if (additionalDetails === undefined || additionalDetails === null) {
    throw new TriageError('Additional details must be provided');
  }
  if (typeof additionalDetails !== 'string') {
    throw new TriageError('Additional details must be a string');
  }
  if (additionalDetails.length > 2000) {
    throw new TriageError('Additional details exceed maximum length of 2000 characters');
  }

  // Reject empty inputs
  const combinedText = symptoms.join(' ').trim() + additionalDetails.trim();
  if (combinedText === '') {
    throw new TriageError('Patient input contains no meaningful text description');
  }
}
