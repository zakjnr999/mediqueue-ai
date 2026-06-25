/**
 * Standard API response shapes returned by the MediQueue backend.
 *
 * All successful responses have { success: true, data: T }.
 * All error responses have  { success: false, error: { code, message } }.
 */

/** Generic wrapper for a successful backend response. */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

/** Error payload returned by the backend. */
export interface ApiErrorPayload {
  code: string;
  message: string;
}

/** Generic wrapper for an error backend response. */
export interface ApiErrorResponse {
  success: false;
  error: ApiErrorPayload;
}

/** Union type for any backend response (convenience use in client code). */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ── Specific response shapes ───────────────────────────────────────────────

export interface LoginResponse {
  idToken: string;
  email: string;
  username: string;
}

export interface CreateCheckinResponse {
  patientId: string;
  queueNumber: string;
  estimatedWaitMinutes: number;
  queuePosition: number;
  status: string;
}

export interface QueueStatsResponse {
  patientsInQueue: number;
  averageWaitMinutes: number;
  redFlagCount: number;
  seenTodayCount: number;
}

export interface PaginatedQueueResponse {
  patients: import('./patient').Patient[];
  nextToken: string | null;
  total: number;
}

export interface UpdateStatusResponse {
  id: string;
  status: string;
}

export interface UpdatePriorityResponse {
  id: string;
  confirmedPriority: string;
}

export interface EscalateResponse {
  id: string;
  status: string;
  escalatedAt: string;
}
