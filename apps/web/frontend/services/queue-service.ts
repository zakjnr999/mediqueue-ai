import { apiGet } from './api-client';

export interface QueueData {
  patients: any[];
  stats: {
    patientsInQueue: number;
    averageWaitMinutes: number;
    redFlagCount: number;
    seenTodayCount: number;
  };
}

export async function fetchQueue(): Promise<QueueData> {
  return apiGet<QueueData>('/queue');
}
