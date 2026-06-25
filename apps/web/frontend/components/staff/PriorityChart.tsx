'use client';

import React from 'react';
import type { Patient } from '@/types/patient';

interface PriorityChartProps {
  patients: Patient[];
}

interface Slice {
  label: string;
  value: number;
  color: string;
  percentage: number;
}

/**
 * PriorityChart — SVG donut chart showing the distribution of patient
 * priority levels (HIGH / MEDIUM / LOW) in the current queue.
 *
 * Uses pure SVG paths calculated from stroke-dasharray/dashoffset,
 * keeping the component lightweight without any charting library dependency.
 */
export function PriorityChart({ patients }: PriorityChartProps) {
  const high = patients.filter(
    (p) => (p.confirmedPriority || p.aiSuggestedPriority) === 'HIGH',
  ).length;
  const medium = patients.filter(
    (p) => (p.confirmedPriority || p.aiSuggestedPriority) === 'MEDIUM',
  ).length;
  const low = patients.filter(
    (p) => (p.confirmedPriority || p.aiSuggestedPriority) === 'LOW',
  ).length;
  const total = high + medium + low;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-text-tertiary text-xs">
        No patient priority data available
      </div>
    );
  }

  const slices: Slice[] = [
    {
      label: 'HIGH',
      value: high,
      color: '#DC2626',
      percentage: Math.round((high / total) * 100),
    },
    {
      label: 'MEDIUM',
      value: medium,
      color: '#D97706',
      percentage: Math.round((medium / total) * 100),
    },
    {
      label: 'LOW',
      value: low,
      color: '#0F7B5E',
      percentage: Math.round((low / total) * 100),
    },
  ];

  // SVG donut pre-calculated arc segments
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      {/* Donut */}
      <div className="relative shrink-0">
        <svg width="120" height="120" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="16" />
          {slices.map((slice) => {
            if (slice.value === 0) return null;
            const length = (slice.percentage / 100) * circumference;
            const dashArray = `${length} ${circumference - length}`;
            const rotation = (offset / circumference) * 360;
            offset += length;
            return (
              <circle
                key={slice.label}
                cx="60"
                cy="60"
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth="16"
                strokeDasharray={dashArray}
                strokeDashoffset={-rotation * (Math.PI / 180) * radius}
                transform="rotate(-90 60 60)"
                className="transition-all duration-500"
              />
            );
          })}
          <circle cx="60" cy="60" r="28" fill="white" />
          <text x="60" y="56" textAnchor="middle" className="text-lg font-bold" fill="#1A202C" fontSize="16" fontWeight="700">
            {total}
          </text>
          <text x="60" y="70" textAnchor="middle" fill="#5A6474" fontSize="9" fontWeight="600">
            Total
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="space-y-2.5">
        {slices.map((slice) => (
          <div key={slice.label} className="flex items-center gap-2.5 text-xs">
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: slice.color }}
            />
            <span className="font-semibold text-text-secondary min-w-[52px]">
              {slice.label}
            </span>
            <span className="font-bold text-text-primary tabular-nums min-w-[24px] text-right">
              {slice.value}
            </span>
            <span className="text-text-tertiary text-[10px] w-[40px] text-right">
              {slice.percentage}%
            </span>
            {/* Mini bar */}
            <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${slice.percentage}%`, backgroundColor: slice.color }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
