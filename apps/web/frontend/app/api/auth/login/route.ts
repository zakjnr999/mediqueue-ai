import { NextRequest, NextResponse } from 'next/server';
import { getMediqueueApiUrl } from '@/lib/config/server-env';

const LOGIN_TIMEOUT_MS = 10_000;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  const apiBaseUrl = getMediqueueApiUrl();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError(400, 'INVALID_JSON', 'The login request is not valid.');
  }

  if (!payload || typeof payload !== 'object') {
    return jsonError(400, 'VALIDATION_ERROR', 'Email and password are required.');
  }

  const { email: rawEmail, password } = payload as Record<string, unknown>;
  if (typeof rawEmail !== 'string' || typeof password !== 'string') {
    return jsonError(400, 'VALIDATION_ERROR', 'Email and password are required.');
  }

  const email = rawEmail.trim();
  if (!email || !password) {
    return jsonError(400, 'VALIDATION_ERROR', 'Email and password are required.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(
      `${apiBaseUrl.replace(/\/$/, '')}/auth/login`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    const responseText = await upstreamResponse.text();
    let upstreamBody: unknown = null;

    try {
      upstreamBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      console.error('Authentication service returned non-JSON content', {
        status: upstreamResponse.status,
      });
      return jsonError(502, 'INVALID_UPSTREAM_RESPONSE', 'Sign-in is temporarily unavailable.');
    }

    if (!upstreamResponse.ok) {
      const safeStatus =
        upstreamResponse.status === 400 ||
        upstreamResponse.status === 401 ||
        upstreamResponse.status === 429
          ? upstreamResponse.status
          : 502;

      const upstreamError =
        upstreamBody && typeof upstreamBody === 'object'
          ? (upstreamBody as Record<string, unknown>).error
          : null;
      const upstreamMessage =
        upstreamError && typeof upstreamError === 'object'
          ? (upstreamError as Record<string, unknown>).message
          : null;
      const message =
        typeof upstreamMessage === 'string'
          ? upstreamMessage
          : upstreamResponse.status === 401
            ? 'Invalid email or password.'
            : 'Sign-in is temporarily unavailable.';

      return jsonError(safeStatus, 'AUTHENTICATION_FAILED', message);
    }

    return NextResponse.json(upstreamBody, { status: upstreamResponse.status });
  } catch (err) {
    console.error('Staff login request failed', err);

    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    return jsonError(
      isTimeout ? 504 : 502,
      isTimeout ? 'AUTH_TIMEOUT' : 'AUTH_SERVICE_ERROR',
      isTimeout
        ? 'The authentication service did not respond in time.'
        : 'Sign-in is temporarily unavailable.',
    );
  } finally {
    clearTimeout(timeout);
  }
}
