/**
 * Next.js API route proxy — forwards requests to the deployed backend
 * so the frontend never hits CORS issues during local development.
 *
 * Uses the server-side MEDIQUEUE_API_URL env var (never exposed to the browser).
 *
 * On Amplify SSR, the MEDIQUEUE_API_URL env var must be configured in the
 * Amplify Console under Environment variables (NOT as NEXT_PUBLIC_*).
 */

import { MEDIQUEUE_API_URL } from '@/lib/config/server-env';

const PROXY_TIMEOUT_MS = 15_000;

/**
 * Catch-all HTTP method handler.
 * Next.js App Router supports this pattern for all standard methods.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return handleRequest(request, path);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return handleRequest(request, path);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return handleRequest(request, path);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return handleRequest(request, path);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return handleRequest(request, path);
}

// ── Core proxy logic ───────────────────────────────────────────────────────

async function handleRequest(request: Request, path: string[]): Promise<Response> {
  // Construct the target URL preserving the query string.
  const searchParams = new URL(request.url).search;
  const targetPath = `/${path.join('/')}${searchParams}`;
  const targetUrl = `${MEDIQUEUE_API_URL.replace(/\/+$/, '')}${targetPath}`;

  // Build forwarded headers.
  // We forward the original headers except for hop-by-hop headers that
  // must NOT be passed to the upstream server.
  const forwardedHeaders = new Headers(request.headers);
  forwardedHeaders.delete('host');
  forwardedHeaders.delete('connection');
  forwardedHeaders.delete('keep-alive');
  forwardedHeaders.delete('transfer-encoding');
  forwardedHeaders.set('x-forwarded-host', new URL(targetUrl).host);
  forwardedHeaders.set('x-forwarded-proto', 'https');

  // Prepare the request body — GET/HEAD/OPTIONS must not carry a body.
  const body = ['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    ? undefined
    : await request.text();

  // Create an AbortController for the timeout.
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), PROXY_TIMEOUT_MS);

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: request.method,
      headers: forwardedHeaders,
      body,
      signal: abortController.signal,
      // Do NOT follow redirects — let the caller handle them.
      redirect: 'manual',
    });

    // Read the upstream body as text — we'll pass it through as-is.
    const upstreamBody = await upstreamResponse.text();

    // Build the response, forwarding all relevant headers.
    const responseHeaders = new Headers();
    const forwardHeaderKeys = [
      'content-type',
      'content-length',
      'cache-control',
      'expires',
      'pragma',
      'etag',
      'last-modified',
    ];
    for (const key of forwardHeaderKeys) {
      const value = upstreamResponse.headers.get(key);
      if (value) {
        responseHeaders.set(key, value);
      }
    }

    return new Response(upstreamBody, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    // Log the internal error server-side (visible in CloudWatch / terminal).
    console.error(`[Proxy] Error forwarding ${request.method} ${targetUrl}:`, err);

    // Determine a safe user-facing error response.
    const isTimeout = err instanceof DOMException && err.name === 'AbortError';
    const message = isTimeout
      ? 'The backend did not respond in time. Please try again.'
      : 'Failed to reach backend. Please try again.';
    const status = isTimeout ? 504 : 502;

    return new Response(
      JSON.stringify({
        success: false,
        error: { code: isTimeout ? 'PROXY_TIMEOUT' : 'PROXY_ERROR', message },
      }),
      {
        status,
        headers: { 'content-type': 'application/json' },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
