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

/** Response from POST /auth/login — wraps the Cognito tokens. */
export interface LoginResponse {
  success: true;
  data: {
    accessToken: string;
    idToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

/** Raw backend response from POST /check-ins. */
export interface CreateCheckinResponse {
  success: true;
  data: {
    patientId: string;
    queueNumber: string;
    status: string;
    aiAssessment: {
      summary: string;
      redFlags: string[];
      suggestedPriority: string;
      reason: string;
      requiresImmediateStaffReview: boolean;
    };
    peopleAhead: number;
    estimatedWaitTimeMinutes: number;
    isEscalated: boolean;
    escalatedBy: string | null;
    createdAt: string;
    sex?: string;
    selfAssessedUrgency?: string;
  };
}

/** Raw backend response from GET /patients/{patientId}. */
export interface PatientDetailsResponse {
  success: true;
  data: {
    patientId: string;
    queueNumber: string;
    fullName: string;
    age: number;
    symptoms: string[];
    phoneNumber?: string;
    additionalDetails?: string;
    sex?: string;
    selfAssessedUrgency?: string;
    aiAssessment: {
      summary: string;
      redFlags: string[];
      suggestedPriority: string;
      reason: string;
      requiresImmediateStaffReview: boolean;
    };
    staffDecision: {
      confirmedPriority: string | null;
      reviewedBy: string | null;
      reviewedAt: string | null;
      overrideReason: string | null;
      reviewerDisplayName: string | null;
    };
    status: string;
    isEscalated: boolean;
    escalatedBy: string | null;
    createdAt: string;
    updatedAt: string;
    peopleAhead: number;
    estimatedWaitTimeMinutes: number;
  };
}

/** Raw backend response from GET /queue. */
export interface QueueListResponse {
  success: true;
  data: {
    date: string;
    patients: QueuePatientItem[];
    nextToken: string | null;
  };
}

/** A patient item as returned by the queue list endpoint. */
export interface QueuePatientItem {
  patientId: string;
  queueNumber: string;
  fullName: string;
  age: number;
  status: string;
  isEscalated: boolean;
  escalatedBy: string | null;
  aiAssessment: {
    summary: string;
    redFlags: string[];
    suggestedPriority: string;
    requiresImmediateStaffReview: boolean;
  };
  staffDecision: {
    confirmedPriority: string | null;
  };
  createdAt: string;
}

/** Raw backend response from GET /queue/stats. */
export interface QueueStatsResponse {
  success: true;
  data: {
    date: string;
    inQueue: number;
    avgWaitTimeMinutes: number;
    redFlags: number;
    seenToday: number;
  };
}
