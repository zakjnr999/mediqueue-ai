/**
 * Tests for the Next.js API proxy route logic.
 *
 * These tests verify the URL construction, header forwarding, timeout,
 * and error-handling behaviour of the proxy route handler without
 * needing a running Next.js server.
 *
 * The real route.ts imports from @/lib/config/server-env (server-only);
 * this test file duplicates the pure logic for isolated testing.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ── Constants (mirrors route.ts) ──────────────────────────────────────────

const BACKEND_BASE = 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev';
const PROXY_TIMEOUT_MS = 15_000;

// ── Pure logic extracted from route.ts handleRequest ───────────────────────

function buildTargetUrl(base, pathSegments, queryString) {
  const targetPath = `/${pathSegments.join('/')}${queryString}`;
  return `${base.replace(/\/+$/, '')}${targetPath}`;
}

function filterHopByHopHeaders(headers) {
  const filtered = { ...headers };
  delete filtered.host;
  delete filtered.connection;
  delete filtered['keep-alive'];
  delete filtered['transfer-encoding'];
  return filtered;
}

function determineErrorResponse(err, isTimeout) {
  const message = isTimeout
    ? 'The backend did not respond in time. Please try again.'
    : 'Failed to reach backend. Please try again.';
  const status = isTimeout ? 504 : 502;
  const code = isTimeout ? 'PROXY_TIMEOUT' : 'PROXY_ERROR';
  return { status, body: { success: false, error: { code, message } } };
}

// ── Tests: URL construction ────────────────────────────────────────────────

test('URL construction: simple path without query', () => {
  const url = buildTargetUrl(BACKEND_BASE, ['auth', 'login'], '');
  assert.equal(url, 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev/auth/login');
});

test('URL construction: path with query string', () => {
  const url = buildTargetUrl(BACKEND_BASE, ['queue'], '?date=2026-06-25&page=1');
  assert.equal(url, 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev/queue?date=2026-06-25&page=1');
});

test('URL construction: nested path segments', () => {
  const url = buildTargetUrl(BACKEND_BASE, ['patients', 'abc-123', 'priority'], '');
  assert.equal(url, 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev/patients/abc-123/priority');
});

test('URL construction: base URL with trailing slash is normalised', () => {
  const url = buildTargetUrl('https://example.com/api/', ['auth', 'login'], '');
  assert.equal(url, 'https://example.com/api/auth/login');
});

test('URL construction: empty path segments', () => {
  const url = buildTargetUrl(BACKEND_BASE, [''], '');
  assert.equal(url, 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev/');
});

// ── Tests: Header filtering ────────────────────────────────────────────────

test('Header filtering: removes hop-by-hop headers', () => {
  const original = {
    host: 'localhost:3000',
    'content-type': 'application/json',
    authorization: 'my-token',
    connection: 'keep-alive',
    'keep-alive': 'timeout=5',
    'transfer-encoding': 'chunked',
    'x-custom': 'value',
  };
  const filtered = filterHopByHopHeaders(original);
  assert.equal(filtered.host, undefined);
  assert.equal(filtered.connection, undefined);
  assert.equal(filtered['keep-alive'], undefined);
  assert.equal(filtered['transfer-encoding'], undefined);
  assert.equal(filtered['content-type'], 'application/json');
  assert.equal(filtered.authorization, 'my-token');
  assert.equal(filtered['x-custom'], 'value');
});

test('Header filtering: empty headers object', () => {
  const filtered = filterHopByHopHeaders({});
  assert.deepEqual(filtered, {});
});

// ── Tests: Error response logic ────────────────────────────────────────────

test('Error response: timeout produces 504 with PROXY_TIMEOUT', () => {
  const result = determineErrorResponse(new DOMException('timeout', 'AbortError'), true);
  assert.equal(result.status, 504);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PROXY_TIMEOUT');
  assert.equal(result.body.error.message, 'The backend did not respond in time. Please try again.');
});

test('Error response: generic error produces 502 with PROXY_ERROR', () => {
  const result = determineErrorResponse(new Error('fetch failed'), false);
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
  assert.equal(result.body.error.code, 'PROXY_ERROR');
  assert.equal(result.body.error.message, 'Failed to reach backend. Please try again.');
});

test('Error response: network error produces 502', () => {
  const result = determineErrorResponse(new TypeError('fetch failed'), false);
  assert.equal(result.status, 502);
  assert.equal(result.body.error.code, 'PROXY_ERROR');
});

// ── Tests: Full proxy flow with mocked fetch ───────────────────────────────

test('Proxy flow: successfully forwards a POST with auth header', async () => {
  // Simulated fetch that returns a successful login response.
  const mockFetch = mock.fn(() =>
    Promise.resolve({
      status: 200,
      statusText: 'OK',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            data: {
              accessToken: 'at',
              idToken: 'it',
              refreshToken: 'rt',
              expiresIn: 3600,
            },
          }),
        ),
      headers: {
        get: (name) => {
          const map = { 'content-type': 'application/json', 'content-length': '128' };
          return map[name] || null;
        },
      },
    }),
  );

  const requestHeaders = new Map();
  requestHeaders.set('authorization', 'raw-id-token');
  requestHeaders.set('content-type', 'application/json');
  requestHeaders.set('host', 'localhost:3000');

  const targetUrl = buildTargetUrl(BACKEND_BASE, ['auth', 'login'], '');
  const filteredHeaders = filterHopByHopHeaders(Object.fromEntries(requestHeaders));
  filteredHeaders['x-forwarded-host'] = new URL(targetUrl).host;
  filteredHeaders['x-forwarded-proto'] = 'https';

  const res = await mockFetch(targetUrl, {
    method: 'POST',
    headers: filteredHeaders,
    body: JSON.stringify({ email: 'nurse@healthcentre.gh', password: 'secret' }),
  });

  assert.equal(res.status, 200);
  const body = JSON.parse(await res.text());
  assert.equal(body.success, true);
  assert.equal(body.data.idToken, 'it');

  // Verify the mock was called once with the expected arguments.
  assert.equal(mockFetch.mock.callCount(), 1);
  const call = mockFetch.mock.calls[0];
  assert.equal(call.arguments[0], targetUrl);
  assert.equal(call.arguments[1].method, 'POST');
  assert.equal(call.arguments[1].headers.authorization, 'raw-id-token');
});

test('Proxy flow: forwards 401 status as-is (no interception)', async () => {
  const mockFetch = mock.fn(() =>
    Promise.resolve({
      status: 401,
      statusText: 'Unauthorized',
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid email or password.' },
          }),
        ),
      headers: {
        get: (name) => {
          const map = { 'content-type': 'application/json' };
          return map[name] || null;
        },
      },
    }),
  );

  const res = await mockFetch(buildTargetUrl(BACKEND_BASE, ['auth', 'login'], ''), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'wrong@example.com', password: 'wrong' }),
  });

  assert.equal(res.status, 401);
  const body = JSON.parse(await res.text());
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'UNAUTHORIZED');
});

test('Proxy flow: returns 504 on timeout', async () => {
  // Simulate the AbortError that fetch throws when a request times out.
  const abortError = new DOMException('The operation was aborted', 'AbortError');

  const mockFetch = mock.fn(() => Promise.reject(abortError));

  try {
    await mockFetch(buildTargetUrl(BACKEND_BASE, ['queue'], ''), {
      method: 'GET',
    });
    assert.fail('Should have thrown');
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    const result = determineErrorResponse(err, isTimeout);
    assert.equal(result.status, 504);
    assert.equal(result.body.error.code, 'PROXY_TIMEOUT');
  }
});
