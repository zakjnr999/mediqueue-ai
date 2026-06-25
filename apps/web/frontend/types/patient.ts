// Patient types used throughout the frontend.
// These mirror the backend DynamoDB schema (camelCase after transformation).

/** Triage priority levels returned by the Bedrock analysis (backend uses HIGH|MEDIUM|LOW). */
export type PatientPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/** Patient lifecycle status in the queue. */
export type PatientStatus = 'WAITING' | 'IN_PROGRESS' | 'COMPLETED' | 'ESCALATED';

/** Urgency level submitted by the patient during check-in (backend validates capitalised: Minor|Moderate|Urgent). */
export type SelfAssessedUrgency = 'Minor' | 'Moderate' | 'Urgent';

/** Biological sex as captured during check-in. */
export type Sex = 'Male' | 'Female' | 'Prefer not to say';

/**
 * Full patient record as returned by GET /queue and GET /patients/{id}.
 * Maps directly to the backend's DynamoDB item shape.
 */
export interface Patient {
  id: string;
  queueNumber: string;
  queueDate: string;
  name: string;
  phone: string;
  age: number;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: SelfAssessedUrgency;
  aiSuggestedPriority: PatientPriority;
  aiSummary: string;
  isRedFlag: boolean;
  confirmedPriority: PatientPriority | null;
  overrideReason?: string;
  notes?: string;
  status: PatientStatus;
  createdAt: string;
  attendedAt?: string;
  completedAt?: string;
  escalatedAt?: string;
}

/**
 * Payload sent to POST /check-ins for a new patient self-check-in.
 */
export interface CheckinRequest {
  name: string;
  phone: string;
  age: number;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: SelfAssessedUrgency;
}

/**
 * Response returned by POST /check-ins on success.
 */
export interface CheckinResult {
  patientId: string;
  queueNumber: string;
  estimatedWaitMinutes: number;
  queuePosition: number;
  status: PatientStatus;
}

/**
 * Form state used by the patient check-in UI before submission.
 * Age is kept as string for input-field compatibility.
 */
export interface PatientFormState {
  name: string;
  phone: string;
  age: string;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: SelfAssessedUrgency;
}
