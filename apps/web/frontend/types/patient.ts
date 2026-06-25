// Patient types used throughout the frontend
// These map between frontend UI conventions and backend API contracts

export type PatientPriority = 'minor' | 'moderate' | 'urgent';

export type PatientStatus = 'waiting' | 'in_progress' | 'completed' | 'escalated';

export type SelfAssessedUrgency = 'minor' | 'moderate' | 'urgent';

export type Sex = 'Male' | 'Female' | 'Prefer not to say';

export interface Patient {
  id: string;
  queueNumber: string;
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
  escalatedAt?: string;
  attendedAt?: string;
  completedAt?: string;
}

export interface CheckinRequest {
  name: string;
  phone: string;
  age: string;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: SelfAssessedUrgency;
}

export interface CheckinResult {
  patientId: string;
  queueNumber: string;
  estimatedWait: number;
  status: string;
  position?: number;
  name?: string;
}

export interface PatientFormState {
  name: string;
  phone: string;
  age: string;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: SelfAssessedUrgency;
}
