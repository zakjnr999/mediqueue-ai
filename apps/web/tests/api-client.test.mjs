/**
 * Tests for the API client's token management and error handling logic.
 *
 * These are pure-logic tests — no DOM, no network. They mirror the
 * in-memory token logic and error-class behaviours from the frontend.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Helper: in-memory token store (mirrors client.ts logic) ────────────────

let currentIdToken = null;

function setIdToken(token) {
  currentIdToken = token;
}

function getIdToken() {
  return currentIdToken;
}

function clearTokenOn401(status, currentToken) {
  if (status === 401 && currentToken) {
    setIdToken(null);
    return true;
  }
  return false;
}

// ── Helper: error classes (mirrors api/errors.ts) ──────────────────────────

class ApiHttpError extends Error {
  constructor(status, code, message) {
    super(`API Error [${code}]: ${message}`);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.backendMessage = message;
  }

  getUserMessage() {
    if (this.status === 401) return 'Session expired. Please sign in again.';
    if (this.status === 403) return 'You do not have permission to perform this action.';
    if (this.status === 404) return 'The requested resource was not found.';
    if (this.status === 409) return 'This could not be completed due to a conflict. Please refresh and try again.';
    if (this.status >= 500) return 'A server error occurred. Please try again later.';
    return this.backendMessage || 'An unexpected error occurred.';
  }
}

class ApiNetworkError extends Error {
  constructor(originalError) {
    super('A network error occurred. Please check your connection and try again.');
    this.name = 'ApiNetworkError';
    this.originalError = originalError;
  }
}

// ── Tests: Token management ────────────────────────────────────────────────

test('Token management: set and get a token', () => {
  setIdToken('test-token-123');
  assert.equal(getIdToken(), 'test-token-123');
});

test('Token management: clear token by setting null', () => {
  setIdToken('test-token-456');
  setIdToken(null);
  assert.equal(getIdToken(), null);
});

test('Token management: initially null', () => {
  // Reset for this test
  currentIdToken = null;
  assert.equal(getIdToken(), null);
});

test('Token management: multiple set/clear cycles', () => {
  setIdToken('token-a');
  assert.equal(getIdToken(), 'token-a');
  setIdToken('token-b');
  assert.equal(getIdToken(), 'token-b');
  setIdToken(null);
  assert.equal(getIdToken(), null);
  setIdToken('token-c');
  assert.equal(getIdToken(), 'token-c');
});

// ── Tests: Auto-clear on 401 ──────────────────────────────────────────────

test('Auto-clear: 401 with valid token clears it', () => {
  setIdToken('valid-token');
  const cleared = clearTokenOn401(401, 'valid-token');
  assert.equal(cleared, true);
  assert.equal(getIdToken(), null);
});

test('Auto-clear: 401 with no token does nothing', () => {
  setIdToken(null);
  const cleared = clearTokenOn401(401, null);
  assert.equal(cleared, false);
  assert.equal(getIdToken(), null);
});

test('Auto-clear: 403 with valid token does NOT clear', () => {
  setIdToken('keep-token');
  const cleared = clearTokenOn401(403, 'keep-token');
  assert.equal(cleared, false);
  assert.equal(getIdToken(), 'keep-token');
});

test('Auto-clear: 500 with valid token does NOT clear', () => {
  setIdToken('keep-token');
  const cleared = clearTokenOn401(500, 'keep-token');
  assert.equal(cleared, false);
  assert.equal(getIdToken(), 'keep-token');
});

// ── Tests: ApiHttpError class ──────────────────────────────────────────────

test('ApiHttpError: constructs and preserves fields', () => {
  const err = new ApiHttpError(401, 'UNAUTHORIZED', 'Invalid credentials');
  assert.equal(err.status, 401);
  assert.equal(err.code, 'UNAUTHORIZED');
  assert.equal(err.backendMessage, 'Invalid credentials');
  assert(err instanceof Error);
});

test('ApiHttpError: user message for 401', () => {
  const err = new ApiHttpError(401, 'UNAUTHORIZED', 'Invalid credentials');
  assert.equal(err.getUserMessage(), 'Session expired. Please sign in again.');
});

test('ApiHttpError: user message for 403', () => {
  const err = new ApiHttpError(403, 'FORBIDDEN', 'Access denied');
  assert.equal(err.getUserMessage(), 'You do not have permission to perform this action.');
});

test('ApiHttpError: user message for 404', () => {
  const err = new ApiHttpError(404, 'NOT_FOUND', 'Resource not found');
  assert.equal(err.getUserMessage(), 'The requested resource was not found.');
});

test('ApiHttpError: user message for 409', () => {
  const err = new ApiHttpError(409, 'CONFLICT', 'Version conflict');
  assert.equal(err.getUserMessage(), 'This could not be completed due to a conflict. Please refresh and try again.');
});

test('ApiHttpError: user message for 500', () => {
  const err = new ApiHttpError(500, 'SERVER_ERROR', 'Something broke');
  assert.equal(err.getUserMessage(), 'A server error occurred. Please try again later.');
});

test('ApiHttpError: user message for unexpected status', () => {
  const err = new ApiHttpError(429, 'RATE_LIMITED', 'Too many requests');
  assert.equal(err.getUserMessage(), 'Too many requests');
});

test('ApiHttpError: user message fallback when backend message missing', () => {
  const err = new ApiHttpError(418, 'TEAPOT', '');
  assert.equal(err.getUserMessage(), 'An unexpected error occurred.');
});

// ── Tests: ApiNetworkError class ───────────────────────────────────────────

test('ApiNetworkError: constructs and preserves original error', () => {
  const original = new Error('fetch failed');
  const err = new ApiNetworkError(original);
  assert.equal(err.name, 'ApiNetworkError');
  assert.equal(err.originalError, original);
  assert(err instanceof Error);
});

test('ApiNetworkError: user-safe message', () => {
  const err = new ApiNetworkError(new Error('net::ERR_CONNECTION_REFUSED'));
  assert.equal(err.message, 'A network error occurred. Please check your connection and try again.');
});
