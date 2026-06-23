import test from 'node:test';
import assert from 'node:assert';
import { validateTriageResponse } from '../src/validation/validate-triage-response.mjs';
import { validatePatientInput } from '../src/validation/validate-patient-input.mjs';
import { TriageError } from '../src/errors/triage-error.mjs';

test('Triage Validation Tests', async (t) => {
  await t.test('valid response passes', () => {
    const validJson = `{"summary": "Mild cough and checkup", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags, mild symptoms", "requiresImmediateStaffReview": false}`;
    const result = validateTriageResponse(validJson);
    assert.deepEqual(result, {
      summary: "Mild cough and checkup",
      redFlags: [],
      suggestedPriority: "LOW",
      reason: "No red flags, mild symptoms",
      requiresImmediateStaffReview: false
    });
  });

  await t.test('malformed JSON throws TriageError', () => {
    const malformed = `{"summary": "test", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false`;
    assert.throws(() => validateTriageResponse(malformed), TriageError);
  });

  await t.test('fenced valid JSON parses successfully', () => {
    const fenced = `\`\`\`json
{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false}
\`\`\``;
    const result = validateTriageResponse(fenced);
    assert.equal(result.suggestedPriority, "LOW");
  });

  await t.test('plain code fenced valid JSON parses successfully', () => {
    const fenced = `\`\`\`
{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false}
\`\`\``;
    const result = validateTriageResponse(fenced);
    assert.equal(result.suggestedPriority, "LOW");
  });

  await t.test('JSON surrounded by prose throws TriageError', () => {
    const proseJson = `Here is the response:
\`\`\`json
{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false}
\`\`\`
Hope this helps!`;
    assert.throws(() => validateTriageResponse(proseJson), TriageError);
  });

  await t.test('missing field throws TriageError', () => {
    const missing = `{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "LOW", "requiresImmediateStaffReview": false}`;
    assert.throws(() => validateTriageResponse(missing), TriageError);
  });

  await t.test('additional field (diagnosis or condition) throws TriageError', () => {
    const extra = `{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false, "diagnosis": "Cold"}`;
    assert.throws(() => validateTriageResponse(extra), TriageError);
  });

  await t.test('invalid priority value throws TriageError', () => {
    const invalidPriority = `{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "URGENT", "reason": "No red flags", "requiresImmediateStaffReview": false}`;
    assert.throws(() => validateTriageResponse(invalidPriority), TriageError);
  });

  await t.test('invalid redFlags type throws TriageError', () => {
    const invalidFlags = `{"summary": "Mild cough", "redFlags": "none", "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false}`;
    assert.throws(() => validateTriageResponse(invalidFlags), TriageError);
  });

  await t.test('invalid boolean type throws TriageError', () => {
    const invalidBool = `{"summary": "Mild cough", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": "false"}`;
    assert.throws(() => validateTriageResponse(invalidBool), TriageError);
  });

  await t.test('empty summary throws TriageError', () => {
    const emptySummary = `{"summary": " ", "redFlags": [], "suggestedPriority": "LOW", "reason": "No red flags", "requiresImmediateStaffReview": false}`;
    assert.throws(() => validateTriageResponse(emptySummary), TriageError);
  });

  // Patient Input Validation Tests
  await t.test('invalid patient input: missing age', () => {
    const input = { symptoms: ['cough'], additionalDetails: 'none' };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('invalid patient input: age out of range', () => {
    const input = { age: 150, symptoms: ['cough'], additionalDetails: 'none' };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('invalid patient input: symptoms not array', () => {
    const input = { age: 25, symptoms: 'cough', additionalDetails: 'none' };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('invalid patient input: symptoms array empty', () => {
    const input = { age: 25, symptoms: [], additionalDetails: 'none' };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('invalid patient input: symptoms empty string', () => {
    const input = { age: 25, symptoms: [' '], additionalDetails: 'none' };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('invalid patient input: symptoms string too long', () => {
    const input = { age: 25, symptoms: ['a'.repeat(201)], additionalDetails: 'none' };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('invalid patient input: additionalDetails too long', () => {
    const input = { age: 25, symptoms: ['cough'], additionalDetails: 'a'.repeat(2001) };
    assert.throws(() => validatePatientInput(input), TriageError);
  });

  await t.test('valid patient input passes', () => {
    const input = { age: 25, symptoms: ['cough'], additionalDetails: 'none' };
    assert.doesNotThrow(() => validatePatientInput(input));
  });
});
