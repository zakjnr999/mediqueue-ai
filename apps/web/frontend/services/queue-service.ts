import { apiGet } from './api-client';

export interface QueueData {
  patients: any[];
  stats: {
    inQueue: number;
    avgWait: number;
    redFlags: number;
    seenToday: number;
  };
}

export async function fetchQueue(): Promise<QueueData> {
  return apiGet<QueueData>('/queue');
}
