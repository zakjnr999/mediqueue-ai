/**
 * Next.js API route proxy — forwards requests to the deployed backend
 * so the frontend never hits CORS issues during local development.
 *
 * When deployed on Amplify SSR, update NEXT_PUBLIC_MEDIQUEUE_API_URL
 * to the real API Gateway URL (CORS headers must be configured there).
 */

const BACKEND_BASE = 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = `${BACKEND_BASE}/${path.join('/')}${request.url.slice(request.url.indexOf('?'))}`;
  return proxyFetch(request, url);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = `${BACKEND_BASE}/${path.join('/')}`;
  return proxyFetch(request, url);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = `${BACKEND_BASE}/${path.join('/')}`;
  return proxyFetch(request, url);
}

async function proxyFetch(original: Request, targetUrl: string): Promise<Response> {
  const headers = new Headers(original.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', new URL(targetUrl).host);

  try {
    const res = await fetch(targetUrl, {
      method: original.method,
      headers,
      body: original.method !== 'GET' ? await original.text() : undefined,
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      statusText: res.statusText,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        success: false,
        error: { code: 'PROXY_ERROR', message: 'Failed to reach backend' },
      }),
      {
        status: 502,
        headers: { 'content-type': 'application/json' },
      },
    );
  }
}
