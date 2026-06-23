import { TriageError } from '../errors/triage-error.mjs';

/**
 * Validates and parses the JSON response from Bedrock.
 * @param {string} rawResponse
 * @returns {object} The validated JSON response
 */
export function validateTriageResponse(rawResponse) {
  if (typeof rawResponse !== 'string') {
    throw new TriageError('Response must be a string');
  }

  let cleaned = rawResponse.trim();

  // Handle single code fence block
  if (cleaned.startsWith('```')) {
    // Expect it to match a single code block exactly, with no prose before or after
    const match = cleaned.match(/^```(?:json)?\n([\s\S]*?)\n```$/);
    if (match) {
      cleaned = match[1].trim();
    } else {
      throw new TriageError('Response contains invalid or multiple code fence blocks, or text outside the code fence');
    }
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new TriageError('Failed to parse response as valid JSON', {
      error: err.message,
      rawResponse: rawResponse
    });
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TriageError('Response is not a valid JSON object', { parsed });
  }

  // Enforce EXACTLY the 5 required keys:
  // summary, redFlags, suggestedPriority, reason, requiresImmediateStaffReview
  const requiredKeys = ['summary', 'redFlags', 'suggestedPriority', 'reason', 'requiresImmediateStaffReview'];
  const actualKeys = Object.keys(parsed);

  if (actualKeys.length !== requiredKeys.length) {
    throw new TriageError(`Response must contain exactly ${requiredKeys.length} fields. Found ${actualKeys.length}.`, {
      expectedFields: requiredKeys,
      foundFields: actualKeys
    });
  }

  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new TriageError(`Missing required field: "${key}"`, { parsed });
    }
  }

  // Verify all fields are correct type and format
  if (typeof parsed.summary !== 'string' || parsed.summary.trim() === '') {
    throw new TriageError('Field "summary" must be a non-empty string', { parsed });
  }

  if (!Array.isArray(parsed.redFlags)) {
    throw new TriageError('Field "redFlags" must be an array', { parsed });
  }
  for (let i = 0; i < parsed.redFlags.length; i++) {
    if (typeof parsed.redFlags[i] !== 'string' || parsed.redFlags[i].trim() === '') {
      throw new TriageError(`Field "redFlags" at index ${i} must be a non-empty string`, { parsed });
    }
  }

  const allowedPriorities = ['HIGH', 'MEDIUM', 'LOW'];
  if (!allowedPriorities.includes(parsed.suggestedPriority)) {
    throw new TriageError(`Field "suggestedPriority" must be one of: ${allowedPriorities.join(', ')}`, { parsed });
  }

  if (typeof parsed.reason !== 'string' || parsed.reason.trim() === '') {
    throw new TriageError('Field "reason" must be a non-empty string', { parsed });
  }

  if (typeof parsed.requiresImmediateStaffReview !== 'boolean') {
    throw new TriageError('Field "requiresImmediateStaffReview" must be a boolean', { parsed });
  }

  return parsed;
}
