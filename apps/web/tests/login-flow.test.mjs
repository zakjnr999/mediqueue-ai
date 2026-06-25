/**
 * Tests for the staff login flow logic.
 *
 * Tests the backend response contract parsing, login form validation,
 * and the error-to-message mapping that mirrors use-staff-auth.ts.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Mock response shapes (mirrors the backend contract) ────────────────────

function makeLoginResponse(overrides = {}) {
  return {
    success: true,
    data: {
      accessToken: 'mock-access-token',
      idToken: 'mock-id-token',
      refreshToken: 'mock-refresh-token',
      expiresIn: 3600,
      ...overrides,
    },
  };
}

function makeErrorResponse(status, code, message) {
  return {
    success: false,
    error: { code, message },
  };
}

// ── Helpers that mirror use-staff-auth.ts ──────────────────────────────────

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'),
    );
  } catch {
    return null;
  }
}

function validateLoginResponse(body) {
  if (!body || !body.success) {
    return { valid: false, reason: 'Request failed — server returned an error.' };
  }
  const data = body.data;
  if (!data) {
    return { valid: false, reason: 'Login response missing data payload.' };
  }
  if (!data.idToken || typeof data.idToken !== 'string') {
    return { valid: false, reason: 'Login response missing idToken.' };
  }
  if (!data.accessToken || typeof data.accessToken !== 'string') {
    return { valid: false, reason: 'Login response missing accessToken.' };
  }
  if (!data.refreshToken || typeof data.refreshToken !== 'string') {
    return { valid: false, reason: 'Login response missing refreshToken.' };
  }
  if (typeof data.expiresIn !== 'number') {
    return { valid: false, reason: 'Login response missing expiresIn.' };
  }
  return { valid: true, data };
}

function getLoginErrorMessage(errStatus, errCode, errMessage) {
  if (errStatus === 401) {
    return 'Invalid email or password. Please try again.';
  }
  if (errStatus >= 400 && errStatus < 500) {
    return errMessage || 'Invalid email or password. Please try again.';
  }
  if (errStatus >= 500) {
    return 'A server error occurred. Please try again later.';
  }
  return errMessage || 'An unexpected error occurred. Please try again.';
}

// ── Tests: JWT payload decoding ────────────────────────────────────────────

test('JWT decode: extracts email from valid JWT', () => {
  // Create a minimal JWT: header.payload.signature
  const payload = Buffer.from(JSON.stringify({ email: 'nurse@healthcentre.gh', sub: 'abc-123' })).toString('base64url');
  const token = `header.${payload}.signature`;
  const decoded = decodeJwtPayload(token);
  assert.notEqual(decoded, null);
  assert.equal(decoded.email, 'nurse@healthcentre.gh');
  assert.equal(decoded.sub, 'abc-123');
});

test('JWT decode: returns null for malformed token', () => {
  assert.equal(decodeJwtPayload('not-a-jwt'), null);
  assert.equal(decodeJwtPayload(''), null);
  assert.equal(decodeJwtPayload('a.b'), null); // only 2 parts, no payload
});

test('JWT decode: returns null for invalid base64', () => {
  const decoded = decodeJwtPayload('header.%%invalid%%payload.signature');
  assert.equal(decoded, null);
});

// ── Tests: Login response validation ───────────────────────────────────────

test('Login response: valid response passes validation', () => {
  const resp = makeLoginResponse();
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, true);
  assert.equal(result.data.idToken, 'mock-id-token');
  assert.equal(result.data.accessToken, 'mock-access-token');
  assert.equal(result.data.refreshToken, 'mock-refresh-token');
  assert.equal(result.data.expiresIn, 3600);
});

test('Login response: missing idToken fails validation', () => {
  const resp = makeLoginResponse({ idToken: undefined });
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
  assert(result.reason.includes('idToken'));
});

test('Login response: missing accessToken fails validation', () => {
  const resp = makeLoginResponse({ accessToken: undefined });
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
  assert(result.reason.includes('accessToken'));
});

test('Login response: missing refreshToken fails validation', () => {
  const resp = makeLoginResponse({ refreshToken: undefined });
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
  assert(result.reason.includes('refreshToken'));
});

test('Login response: missing expiresIn fails validation', () => {
  const resp = makeLoginResponse({ expiresIn: undefined });
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
  assert(result.reason.includes('expiresIn'));
});

test('Login response: non-numeric expiresIn fails validation', () => {
  const resp = makeLoginResponse({ expiresIn: '3600' });
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
});

test('Login response: null idToken fails validation', () => {
  const resp = makeLoginResponse({ idToken: null });
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
});

test('Login response: success=false fails validation', () => {
  const resp = { success: false, error: { code: 'UNAUTHORIZED', message: 'Bad credentials' } };
  const result = validateLoginResponse(resp);
  assert.equal(result.valid, false);
});

// ── Tests: Error-to-message mapping ────────────────────────────────────────

test('Login error: 401 maps to invalid credentials message', () => {
  const msg = getLoginErrorMessage(401, 'UNAUTHORIZED', 'Invalid login');
  assert.equal(msg, 'Invalid email or password. Please try again.');
});

test('Login error: 400 maps to backend message', () => {
  const msg = getLoginErrorMessage(400, 'VALIDATION_ERROR', 'Email is required');
  assert.equal(msg, 'Email is required');
});

test('Login error: 400 with empty message maps to fallback', () => {
  const msg = getLoginErrorMessage(400, 'BAD_REQUEST', '');
  assert.equal(msg, 'Invalid email or password. Please try again.');
});

test('Login error: 500 maps to server error message', () => {
  const msg = getLoginErrorMessage(500, 'SERVER_ERROR', 'Internal error');
  assert.equal(msg, 'A server error occurred. Please try again later.');
});

test('Login error: 503 maps to server error message', () => {
  const msg = getLoginErrorMessage(503, 'SERVICE_UNAVAILABLE', 'Down for maintenance');
  assert.equal(msg, 'A server error occurred. Please try again later.');
});

test('Login error: unknown status uses backend message', () => {
  const msg = getLoginErrorMessage(429, 'RATE_LIMITED', 'Too many attempts. Wait 30s.');
  assert.equal(msg, 'Too many attempts. Wait 30s.');
});

test('Login error: unknown status with empty message uses 4xx fallback', () => {
  // 4xx with empty backend message falls back to the "Invalid email or password" default.
  const msg = getLoginErrorMessage(429, 'RATE_LIMITED', '');
  assert.equal(msg, 'Invalid email or password. Please try again.');
});

// ── Tests: Token extracted from successful login response ──────────────────

test('Login flow: token extraction matches use-staff-auth pattern', () => {
  const backendResp = makeLoginResponse({
    idToken: 'eyJhbGciOiJSUzI1NiIsImtpZCI6InRlc3QifQ.eyJlbWFpbCI6Im51cnNlQGhjLWdoYW5hLm9yZy5naCIsInN1YiI6InVzZXItaWQifQ.signature',
    accessToken: 'access-token-abc',
    refreshToken: 'refresh-token-xyz',
    expiresIn: 3600,
  });

  const result = validateLoginResponse(backendResp);
  assert.equal(result.valid, true);

  // Simulate setIdToken(result.data.idToken) — what useStaffAuth does
  const storedToken = result.data.idToken;
  assert.equal(storedToken, backendResp.data.idToken);
  assert.notEqual(storedToken, null);

  // Decode the JWT to extract display email (as useStaffAuth does)
  const decoded = decodeJwtPayload(storedToken);
  assert.notEqual(decoded, null);
  assert.equal(decoded.email, 'nurse@hc-ghana.org.gh');
});
