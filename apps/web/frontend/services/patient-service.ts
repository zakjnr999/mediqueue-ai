import { apiGet, apiPatch } from './api-client';

export async function fetchPatientById(id: string): Promise<any> {
  return apiGet<any>('/patient', { id });
}

export async function fetchPatientByQueueNumber(queueNumber: string): Promise<any> {
  return apiGet<any>('/patient', { queueNumber });
}

export async function updatePatientState(id: string, updates: Record<string, unknown>): Promise<any> {
  return apiPatch<any>(`/patient?id=${id}`, updates);
}
