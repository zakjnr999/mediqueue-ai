'use client';

import React from 'react';
import { Clock } from 'lucide-react';
import type { Patient } from '@/types/patient';

interface ActivityTimelineProps {
  patients: Patient[];
}

interface HourBucket {
  hour: string;
  label: string;
  count: number;
  active: boolean;
}

/**
 * ActivityTimeline — visual timeline showing patient arrivals grouped
 * by hour over the current shift. Uses pure CSS bars (no charting lib).
 *
 * Highlights the current hour to give staff a sense of arrival trends
 * and peak periods during the day.
 */
export function ActivityTimeline({ patients }: ActivityTimelineProps) {
  // Build hourly buckets for today
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Generate 12 buckets: from 6 hours ago to 6 hours ahead
  const buckets: HourBucket[] = [];
  for (let i = -6; i <= 5; i++) {
    const date = new Date(todayStart.getTime() + (now.getHours() + i) * 60 * 60 * 1000);
    const hour = date.getHours();
    const isCurrent = i === 0;
    const isPast = date <= now;
    buckets.push({
      hour: hour.toString().padStart(2, '0'),
      label: hour === 0 ? '12a' : hour === 12 ? '12p' : hour > 12 ? `${hour - 12}p` : `${hour}a`,
      count: 0,
      active: isCurrent && isPast,
    });
  }

  // Count patients in each bucket
  patients.forEach((p) => {
    const createdAt = new Date(p.createdAt);
    const bucketHour = createdAt.getHours();
    const idx = buckets.findIndex((b) => parseInt(b.hour) === bucketHour);
    if (idx !== -1) {
      buckets[idx].count++;
    }
  });

  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-text-secondary">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-semibold">Today&apos;s Arrival Timeline</span>
        <span className="text-text-tertiary">(hourly)</span>
      </div>

      <div className="flex items-end gap-1.5 h-32">
        {buckets.map((bucket) => {
          const height = (bucket.count / maxCount) * 100;
          return (
            <div
              key={bucket.hour}
              className="flex-1 flex flex-col items-center gap-1 h-full justify-end"
            >
              {/* Bar */}
              <div className="relative w-full flex justify-center" style={{ height: `${Math.max(height, 4)}%` }}>
                <div
                  className={`
                    w-full max-w-[32px] rounded-t-md transition-all duration-300
                    ${bucket.active
                      ? 'bg-brand'
                      : bucket.count > 0
                        ? 'bg-brand-light border-t border-brand/30'
                        : 'bg-slate-100'
                    }
                  `}
                  style={{ height: '100%' }}
                />
              </div>
              {/* Count label */}
              {bucket.count > 0 && (
                <span className="text-[10px] font-bold text-text-primary tabular-nums -mt-1">
                  {bucket.count}
                </span>
              )}
              {/* Hour label */}
              <span
                className={`
                  text-[9px] font-semibold
                  ${bucket.active ? 'text-brand' : 'text-text-tertiary'}
                `}
              >
                {bucket.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
