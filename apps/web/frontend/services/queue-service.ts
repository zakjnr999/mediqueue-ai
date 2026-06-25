import { apiGet } from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { QueueListResponse, QueueStatsResponse } from '@/types/api';
import type { Patient, PatientPriority, PatientStatus } from '@/types/patient';
import type { Stats } from '@/types/queue';

export interface QueueData {
  patients: Patient[];
  stats: Stats;
}

const QUEUE_FETCH_LIMIT = 50;
const QUEUE_MAX_PAGES = 3;

/**
 * Map a raw queue list item from the backend to the frontend Patient type.
 */
function mapQueueItem(item: import('@/types/api').QueuePatientItem): Patient {
  const ai = item.aiAssessment;
  const sd = item.staffDecision;

  return {
    id: item.patientId,
    queueNumber: item.queueNumber,
    queueDate: '',
    name: item.fullName,
    phone: '',
    age: item.age,
    sex: item.sex || '',
    symptoms: [],
    freeText: '',
    selfUrgency: 'Minor',
    aiSuggestedPriority: (ai?.suggestedPriority || 'MEDIUM') as PatientPriority,
    aiSummary: ai?.summary || '',
    isRedFlag: (ai?.redFlags?.length ?? 0) > 0,
    confirmedPriority: (sd?.confirmedPriority as PatientPriority | null) ?? null,
    overrideReason: undefined,
    notes: undefined,
    status: item.status as PatientStatus,
    createdAt: item.createdAt,
    attendedAt: undefined,
    completedAt: undefined,
    escalatedAt: item.isEscalated ? item.createdAt : undefined,
  };
}

/**
 * Fetch the patient queue list and stats from the backend.
 * Makes two parallel requests: GET /queue and GET /queue/stats.
 */
export async function fetchQueue(): Promise<QueueData> {
  const [firstListResponse, statsResponse] = await Promise.all([
    apiGet<QueueListResponse>(`${ENDPOINTS.queue.list}?limit=${QUEUE_FETCH_LIMIT}`, { timeout: 10_000 }),
    apiGet<QueueStatsResponse>(ENDPOINTS.queue.stats, { timeout: 10_000 }),
  ]);

  const queueItems: import('@/types/api').QueuePatientItem[] =
    firstListResponse.success ? [...firstListResponse.data.patients] : [];

  let nextToken = firstListResponse.success ? firstListResponse.data.nextToken : null;
  let pagesFetched = 1;

  while (nextToken && pagesFetched < QUEUE_MAX_PAGES) {
    const params = new URLSearchParams({
      limit: String(QUEUE_FETCH_LIMIT),
      nextToken,
    });
    const response = await apiGet<QueueListResponse>(
      `${ENDPOINTS.queue.list}?${params.toString()}`,
      { timeout: 10_000 },
    );

    if (!response.success) break;
    queueItems.push(...response.data.patients);
    nextToken = response.data.nextToken;
    pagesFetched += 1;
  }

  const patients: Patient[] = queueItems.map(mapQueueItem);

  const stats: Stats = statsResponse.success
    ? {
        patientsInQueue: statsResponse.data.inQueue,
        averageWaitMinutes: statsResponse.data.avgWaitTimeMinutes,
        redFlagCount: statsResponse.data.redFlags,
        seenTodayCount: statsResponse.data.seenToday,
      }
    : {
        patientsInQueue: 0,
        averageWaitMinutes: 0,
        redFlagCount: 0,
        seenTodayCount: 0,
      };

  return { patients, stats };
}
