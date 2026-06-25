/**
 * Centralised API endpoint paths.
 *
 * All paths are relative to the configured MEDIQUEUE_API_URL base.
 * Using this module instead of string literals ensures consistency
 * when endpoints change.
 */

export const ENDPOINTS = {
  /** Staff authentication (Cognito). */
  auth: {
    login: '/auth/login',
  },

  /** Patient check-in flow. */
  checkins: {
    create: '/check-ins',
  },

  /** Staff queue and statistics. */
  queue: {
    /** GET /queue — paginated patient queue. */
    list: '/queue',
    /** GET /queue/stats — daily queue statistics. */
    stats: '/queue/stats',
  },

  /** Patient detail and mutation endpoints (all require auth). */
  patients: {
    /** GET /patients/{patientId} — full patient details. */
    details: (patientId: string) => `/patients/${patientId}`,
    /** PATCH /patients/{patientId}/priority — override priority. */
    priority: (patientId: string) => `/patients/${patientId}/priority`,
    /** PATCH /patients/{patientId}/status — update patient status. */
    status: (patientId: string) => `/patients/${patientId}/status`,
    /** POST /patients/{patientId}/escalate — escalate patient. */
    escalate: (patientId: string) => `/patients/${patientId}/escalate`,
  },
} as const;
