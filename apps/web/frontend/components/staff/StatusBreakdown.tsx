'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import type { Patient } from '@/types/patient';
import { STATUS_LABELS } from '@/constants';

interface StatusBreakdownProps {
  patients: Patient[];
}

interface BarSegment {
  status: string;
  label: string;
  color: string;
  count: number;
  percentage: number;
}

const STATUS_COLORS: Record<string, string> = {
  WAITING: '#2563EB',
  IN_PROGRESS: '#D97706',
  COMPLETED: '#0F7B5E',
  ESCALATED: '#DC2626',
};

/**
 * StatusBreakdown — horizontal stacked bar showing what proportion of
 * patients are in each lifecycle status. Gives a quick pulse check on
 * ED throughput: are patients mostly waiting, in progress, or done?
 */
export function StatusBreakdown({ patients }: StatusBreakdownProps) {
  const total = patients.length;
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-text-tertiary text-sm">
        No patient status data
      </div>
    );
  }

  const segments: BarSegment[] = ['WAITING', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED']
    .map((status) => {
      const count = patients.filter((p) => p.status === status).length;
      return {
        status,
        label: STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status,
        color: STATUS_COLORS[status] || '#94A3B8',
        count,
        percentage: Math.round((count / total) * 100),
      };
    })
    .filter((s) => s.count > 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Activity className="w-3.5 h-3.5" />
        <span className="font-semibold">Status Breakdown</span>
        <span className="text-text-tertiary">{total} patients</span>
      </div>

      {/* Stacked bar */}
      <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex">
        {segments.map((seg) => (
          <div
            key={seg.status}
            className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${seg.percentage}%`,
              backgroundColor: seg.color,
            }}
            title={`${seg.label}: ${seg.count} (${seg.percentage}%)`}
          />
        ))}
      </div>

      {/* Legend row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.status} className="flex items-center gap-1.5 text-sm">
            <span
              className="w-2 h-2 rounded-sm shrink-0"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-text-secondary font-medium">{seg.label}</span>
            <span className="text-text-primary font-bold tabular-nums">{seg.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
