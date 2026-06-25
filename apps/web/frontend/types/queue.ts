// Queue and dashboard types — aligned with backend /queue/* contracts.

export interface Stats {
  /** Number of patients currently in the queue. */
  patientsInQueue: number;
  /** Average wait time in minutes. */
  averageWaitMinutes: number;
  /** Number of red-flag patients in the queue. */
  redFlagCount: number;
  /** Number of patients seen (COMPLETED) today. */
  seenTodayCount: number;
}

export type QueueFilter = 'all' | 'red_flag' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';

export type SortOption = 'priority' | 'arrival' | 'wait_time';

/** Paginated queue list response from GET /queue. */
export interface QueueListResponse {
  patients: import('./patient').Patient[];
  nextToken: string | null;
  total: number;
}
