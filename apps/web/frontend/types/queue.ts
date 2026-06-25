// Queue and dashboard types

export interface Stats {
  inQueue: number;
  avgWait: number;
  redFlags: number;
  seenToday: number;
}

export type QueueFilter = 'all' | 'red_flag' | 'waiting' | 'in_progress' | 'completed';

export type SortOption = 'priority' | 'arrival' | 'wait_time';
