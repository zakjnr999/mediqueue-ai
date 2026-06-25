import { Thermometer, Wind, Activity, Droplet, Brain, EyeOff, Bone, MoreHorizontal } from 'lucide-react';

export const SYMPTOM_LIST = [
  { id: 'fever', label: 'Fever', icon: Thermometer },
  { id: 'cough', label: 'Cough', icon: Wind },
  { id: 'chest_pain', label: 'Chest pain', icon: Activity },
  { id: 'vomiting', label: 'Vomiting', icon: Droplet },
  { id: 'headache', label: 'Headache', icon: Brain },
  { id: 'dizziness', label: 'Dizziness', icon: EyeOff },
  { id: 'body_aches', label: 'Body aches', icon: Bone },
  { id: 'other', label: 'Other', icon: MoreHorizontal },
] as const;

export const URGENCY_LABELS = {
  Minor: 'Minor',
  Moderate: 'Moderate',
  Urgent: 'Urgent',
} as const;

export const PRIORITY_LABELS = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
} as const;

export const STATUS_LABELS: Record<string, string> = {
  WAITING: 'Waiting',
  IN_PROGRESS: 'Attending',
  COMPLETED: 'Completed',
  ESCALATED: 'Escalated',
};

export const POLLING_INTERVALS = {
  patientStatus: 15000,
  queueData: 20000,
} as const;

export const CLINIC_NAME = 'Ridge Regional Clinic';

export const DEMO_CREDENTIALS = {
  email: 'nurse@healthcentre.gh',
  password: 'password123',
} as const;
