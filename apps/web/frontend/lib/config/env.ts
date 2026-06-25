/**
 * Environment configuration for MediQueue AI frontend.
 *
 * All public environment variables are exposed via NEXT_PUBLIC_*.
 * Never import private environment variables here — those stay server-side.
 *
 * During local development NEXT_PUBLIC_MEDIQUEUE_API_URL should be "/api"
 * so the browser sends requests to the Next.js proxy route, which forwards
 * them to the real backend using the server-side MEDIQUEUE_API_URL.
 *
 * The actual API Gateway URL is set as MEDIQUEUE_API_URL (no prefix) in
 * .env.local — used only by the proxy route (server-only).
 */

export const MEDIQUEUE_API_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MEDIQUEUE_API_URL) || '';

export const COGNITO_USER_POOL_CLIENT_ID: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID) || '';

/**
 * Validates that required environment variables are present.
 * Warns in development so misconfiguration is caught early.
 */
export function validateEnvironment(): void {
  if (!MEDIQUEUE_API_URL) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[MediQueue] NEXT_PUBLIC_MEDIQUEUE_API_URL is not set.\n' +
        '  Create a .env.local file in apps/web/frontend/ with:\n' +
        '  NEXT_PUBLIC_MEDIQUEUE_API_URL=/api\n' +
        '  (Set to "/api" so the browser calls the Next.js proxy route.)'
      );
    }
  }
  if (!COGNITO_USER_POOL_CLIENT_ID) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[MediQueue] NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID is not set.\n' +
        '  Staff login will not work without it.'
      );
    }
  }
}
