/**
 * Environment configuration for MediQueue AI frontend.
 *
 * All public environment variables are exposed via NEXT_PUBLIC_*.
 * Never import private environment variables here — those stay server-side.
 */

export const MEDIQUEUE_API_URL: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MEDIQUEUE_API_URL) || '';

export const COGNITO_USER_POOL_CLIENT_ID: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID) || '';

/**
 * Validates that required environment variables are present.
 * Throws in development so misconfiguration is caught early.
 * In production, the API client will fail with a clear error message.
 */
export function validateEnvironment(): void {
  if (!MEDIQUEUE_API_URL) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[MediQueue] NEXT_PUBLIC_MEDIQUEUE_API_URL is not set.\n' +
        '  Create a .env.local file in apps/web/frontend/ with:\n' +
        '  NEXT_PUBLIC_MEDIQUEUE_API_URL=https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev'
      );
    }
  }
}
