/**
 * Server-only environment configuration.
 *
 * Import this module only from API route handlers, server components,
 * server actions, or other Node.js contexts.
 *
 * If imported from client code, Next.js will throw a build error
 * thanks to the `server-only` package import.
 *
 * Exposes the validated backend API Gateway base URL.
 */

import 'server-only';

const DEFAULT_MEDIQUEUE_API_URL = 'https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required server-side environment variable: ${name}\n` +
        `  Add it to .env.local:\n` +
        `  ${name}=https://p7xz21rbv0.execute-api.us-west-2.amazonaws.com/dev\n` +
        `  Also set it in the Amplify Console environment variables.`,
    );
  }
  return value;
}

/**
 * Returns the backend API Gateway base URL (server-side only).
 * Read this at request time so Next.js builds do not require runtime env.
 */
export function getMediqueueApiUrl(): string {
  return process.env.MEDIQUEUE_API_URL || DEFAULT_MEDIQUEUE_API_URL;
}
