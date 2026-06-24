import { ApiError } from '../errors/api-error.mjs';

/**
 * Validates whether a string represents a real calendar date in YYYY-MM-DD format using UTC.
 * 
 * @param {string} dateStr 
 * @returns {boolean}
 */
export function isValidCalendarDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  const dateObj = new Date(Date.UTC(y, m, d));
  return dateObj.getUTCFullYear() === y && dateObj.getUTCMonth() === m && dateObj.getUTCDate() === d;
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ALLOWED_STATUS_VALUES = ['WAITING', 'IN_PROGRESS', 'COMPLETED'];

/**
 * Normalizes filter values for token serialization.
 * Converts string "true"/"false" to boolean, null to null, status to trimmed or null.
 *
 * @param {object} filters - Raw filter values from validated query
 * @returns {object} Normalized filters object
 */
function normalizeFilters(filters) {
  const status = filters && filters.status ? filters.status.trim() : null;
  const hasRedFlags = filters && filters.hasRedFlags !== undefined && filters.hasRedFlags !== null
    ? filters.hasRedFlags === true || filters.hasRedFlags === 'true'
    : null;
  return { status, hasRedFlags };
}

/**
 * Serializes a LastEvaluatedKey into a base64url encoded opaque token string.
 * Includes filter context to bind the token to the current filter combination.
 * 
 * @param {object} lastEvaluatedKey 
 * @param {string} dateStr - The request date YYYY-MM-DD
 * @param {object} [filters] - Optional filter context { status, hasRedFlags }
 * @returns {string|null}
 */
export function serializeToken(lastEvaluatedKey, dateStr, filters = null) {
  if (!lastEvaluatedKey) return null;
  const normalizedFilters = normalizeFilters(filters);
  const payload = {
    v: 2,
    date: dateStr,
    filters: {
      status: normalizedFilters.status || null,
      hasRedFlags: normalizedFilters.hasRedFlags !== null ? normalizedFilters.hasRedFlags : null
    },
    key: {
      id: lastEvaluatedKey.id,
      gsi1pk: lastEvaluatedKey.gsi1pk,
      gsi1sk: lastEvaluatedKey.gsi1sk
    }
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Deserializes and strictly validates a base64url token into a DynamoDB ExclusiveStartKey.
 * Validates date, filter context, and key structure.
 * 
 * @param {string} token 
 * @param {string} requestedDate - The request date YYYY-MM-DD
 * @param {object} [requestedFilters] - The current request's filter values { status, hasRedFlags }
 * @returns {object|null}
 * @throws {ApiError}
 */
export function deserializeToken(token, requestedDate, requestedFilters = null) {
  if (!token) return null;

  if (typeof token !== 'string' || token.trim() === '') {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token must be a non-empty string');
  }

  if (token.length > 2048) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token exceeds maximum allowed length');
  }

  let parsed;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    parsed = JSON.parse(decoded);
  } catch (err) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Invalid pagination token format');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token is not a valid JSON object');
  }

  // Check top-level keys for v2: v, date, filters, key
  const topKeys = Object.keys(parsed);
  const requiredTopKeys = ['v', 'date', 'filters', 'key'];
  if (topKeys.length !== requiredTopKeys.length || !requiredTopKeys.every(k => topKeys.includes(k))) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token structure is invalid');
  }

  if (parsed.v !== 2) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Unsupported pagination token version');
  }

  if (!isValidCalendarDate(parsed.date)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token contains an invalid date');
  }

  if (parsed.date !== requestedDate) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token date does not match the requested queue date');
  }

  // Validate filters object
  const filterObj = parsed.filters;
  if (typeof filterObj !== 'object' || filterObj === null || Array.isArray(filterObj)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token filters must be a valid object');
  }

  const filterKeys = Object.keys(filterObj);
  const requiredFilterKeys = ['status', 'hasRedFlags'];
  if (filterKeys.length !== requiredFilterKeys.length || !requiredFilterKeys.every(k => filterKeys.includes(k))) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token filter structure is invalid');
  }

  // Validate token filter values
  if (filterObj.status !== null && !ALLOWED_STATUS_VALUES.includes(filterObj.status)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token contains an invalid status filter');
  }
  if (filterObj.hasRedFlags !== null && typeof filterObj.hasRedFlags !== 'boolean') {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token contains an invalid hasRedFlags filter');
  }

  // Validate token filters match requested filters
  const reqFilters = normalizeFilters(requestedFilters);
  if (filterObj.status !== reqFilters.status) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token status filter does not match the current request');
  }
  if (filterObj.hasRedFlags !== reqFilters.hasRedFlags) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token red-flag filter does not match the current request');
  }

  const keyObj = parsed.key;
  if (typeof keyObj !== 'object' || keyObj === null || Array.isArray(keyObj)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token key parameter is invalid');
  }

  // Key should contain exactly id, gsi1pk, and gsi1sk
  const keyFields = Object.keys(keyObj);
  const requiredKeyFields = ['id', 'gsi1pk', 'gsi1sk'];
  if (keyFields.length !== requiredKeyFields.length || !requiredKeyFields.every(k => keyFields.includes(k))) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token key values are invalid');
  }

  if (typeof keyObj.id !== 'string' || typeof keyObj.gsi1pk !== 'string' || typeof keyObj.gsi1sk !== 'string') {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Pagination token values must be string types');
  }

  // Validate id structure
  const idPrefix = 'PATIENT#';
  if (!keyObj.id.startsWith(idPrefix)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Invalid patient ID format in token');
  }
  const patientId = keyObj.id.substring(idPrefix.length);
  if (!UUID_V4_REGEX.test(patientId)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Patient ID in token is not a valid UUID v4');
  }

  // Validate gsi1pk
  if (keyObj.gsi1pk !== `QUEUE#${requestedDate}`) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Token index PK does not match requested queue index');
  }

  // Validate gsi1sk
  const skParts = keyObj.gsi1sk.split('#');
  if (skParts.length !== 2) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Invalid GSI SK structure in token');
  }
  const timestamp = skParts[0];
  const skPatientId = skParts[1];

  // Standard UTC ISO timestamp structure check
  const isoTimestampRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
  if (!isoTimestampRegex.test(timestamp)) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Invalid timestamp in token SK');
  }

  // Match suffixes
  if (patientId !== skPatientId) {
    throw new ApiError('INVALID_PAGINATION_TOKEN', 400, 'Patient ID mismatch inside token parameters');
  }

  return keyObj;
}
