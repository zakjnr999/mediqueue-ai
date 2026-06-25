'use client';

import React from 'react';
import type { Stats } from '@/types/queue';

interface MetricCardsProps {
  stats: Stats;
}

export function MetricCards({ stats }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-surface-border rounded-lg p-4 flex flex-col justify-between shadow-sm">
        <span className="text-xs font-bold text-text-tertiary uppercase">In active queue</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-3xl font-bold text-text-primary">{stats.patientsInQueue}</span>
          <span className="text-xs text-text-secondary">waiting</span>
        </div>
      </div>

      <div className="bg-white border border-surface-border rounded-lg p-4 flex flex-col justify-between shadow-sm">
        <span className="text-xs font-bold text-text-tertiary uppercase">Average wait</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-3xl font-bold text-text-primary">~{stats.averageWaitMinutes}m</span>
          <span className="text-xs text-text-secondary">estimate</span>
        </div>
      </div>

      <div className={`border rounded-lg p-4 flex flex-col justify-between shadow-sm transition-all duration-300 ${
        stats.redFlagCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-surface-border'
      }`}>
        <span className="text-xs font-bold text-text-tertiary uppercase flex items-center gap-1">
          <span>Critical flags</span>
          {stats.redFlagCount > 0 && <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />}
        </span>
        <div className="flex items-baseline justify-between mt-2">
          <span className={`text-3xl font-bold ${stats.redFlagCount > 0 ? 'text-red-700 animate-pulse' : 'text-text-primary'}`}>
            {stats.redFlagCount}
          </span>
          <span className={`text-xs font-semibold ${stats.redFlagCount > 0 ? 'text-red-700' : 'text-text-secondary'}`}>
            {stats.redFlagCount > 0 ? 'needs review' : 'none'}
          </span>
        </div>
      </div>

      <div className="bg-white border border-surface-border rounded-lg p-4 flex flex-col justify-between shadow-sm">
        <span className="text-xs font-bold text-text-tertiary uppercase">Seen this shift</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-3xl font-bold text-text-primary">{stats.seenTodayCount}</span>
          <span className="text-xs text-text-secondary">completed</span>
        </div>
      </div>
    </div>
  );
}
