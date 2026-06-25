/**
 * Reusable typed API client for the MediQueue backend.
 *
 * - Attaches JSON content-type headers automatically.
 * - Injects the current Cognito ID token on protected requests.
 * - Distinguishes HTTP errors (ApiHttpError) from network errors (ApiNetworkError).
 * - Supports request timeouts and external cancellation via AbortSignal.
 * - Parses backend error responses safely.
 * - Persists the ID token in sessionStorage so it survives page refreshes.
 * - Never logs tokens or sensitive headers.
 */

import { MEDIQUEUE_API_URL, validateEnvironment } from '@/lib/config/env';
import { ApiHttpError, ApiNetworkError } from '@/lib/api/errors';

// ── Auth token management with sessionStorage persistence ──────────────────

const TOKEN_STORAGE_KEY = 'mediqueue_id_token';

let currentIdToken: string | null = null;

/** Initialise the token from sessionStorage (called once at module load). */
function initToken(): string | null {
  if (typeof window === 'undefined') return null; // SSR guard
  try {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      currentIdToken = stored;
      return stored;
    }
  } catch {
    // sessionStorage may be blocked in some environments (e.g. sandboxed iframes).
  }
  return null;
}

// Load persisted token on first import.
initToken();

/**
 * Set the Cognito ID token.
 * Persists to sessionStorage so it survives page refreshes.
 * Pass null to clear.
 */
export function setIdToken(token: string | null): void {
  currentIdToken = token;
  if (typeof window !== 'undefined') {
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // Silently ignore storage errors.
    }
  }
}

/** Retrieve the currently stored ID token (for checking auth state). */
export function getIdToken(): string | null {
  return currentIdToken;
}

// ── Options ────────────────────────────────────────────────────────────────

export interface ApiRequestOptions {
  /** Request timeout in milliseconds (default 15 000). */
  timeout?: number;
  /** External abort signal for request cancellation. */
  signal?: AbortSignal;
}

// ── Internal helpers ───────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Combine multiple AbortSignals into one.
 * The combined signal aborts if *any* of the inputs abort.
 */
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const sig of signals) {
    if (sig.aborted) {
      controller.abort(sig.reason);
      return controller.signal;
    }
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}

async function request<T>(
  method: string,
  path: string,
  options?: ApiRequestOptions & { body?: unknown },
): Promise<T> {
  // Validate configuration early in development.
  if (process.env.NODE_ENV === 'development') {
    validateEnvironment();
  }

  const baseUrl = MEDIQUEUE_API_URL;
  if (!baseUrl) {
    throw new ApiNetworkError(
      new Error(
        'API base URL is not configured. ' +
          'Set NEXT_PUBLIC_MEDIQUEUE_API_URL in your .env.local file.',
      ),
    );
  }

  const url = `${baseUrl.replace(/\/+$/, '')}${path}`;
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;

  // Build abort controller for timeout.
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Combine timeout signal with any external signal.
  const combinedSignal = options?.signal
    ? combineSignals(options.signal, timeoutController.signal)
    : timeoutController.signal;

  // Build headers (never log or expose these).
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (currentIdToken) {
    // The deployed backend expects the raw ID token (no "Bearer" prefix).
    headers['Authorization'] = currentIdToken;
  }

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: combinedSignal,
    });

    // Attempt to parse the JSON body.
    let body: Record<string, unknown>;
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    if (!res.ok) {
      // If the server rejects our token, clear it immediately so subsequent
      // requests don't carry a stale credential.
      if (res.status === 401 && currentIdToken) {
        setIdToken(null);
      }

      const errBody = (body?.error as Record<string, unknown>) ?? {};
      const code = typeof errBody?.code === 'string' ? errBody.code : 'UNKNOWN';
      const message =
        typeof errBody?.message === 'string'
          ? errBody.message
          : `Request failed with status ${res.status}`;
      throw new ApiHttpError(res.status, code, message);
    }

    return body as T;
  } catch (err) {
    if (err instanceof ApiHttpError) {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (options?.signal?.aborted) {
        // The caller intentionally cancelled.
        throw new ApiNetworkError(err);
      }
      throw new ApiNetworkError(new Error('Request timed out'));
    }
    throw new ApiNetworkError(err);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Public API surface ─────────────────────────────────────────────────────

/** Perform a GET request. */
export async function apiGet<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  return request<T>('GET', path, options);
}

/** Perform a POST request with a JSON body. */
export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>('POST', path, { ...options, body });
}

/** Perform a PATCH request with a JSON body. */
export async function apiPatch<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<T> {
  return request<T>('PATCH', path, { ...options, body });
}
