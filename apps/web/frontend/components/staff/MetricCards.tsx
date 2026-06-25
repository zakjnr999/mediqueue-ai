'use client';

import React from 'react';
import type { Stats } from '@/types/queue';

interface MetricCardsProps {
  stats: Stats;
}

export function MetricCards({ stats }: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">In Active Queue</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-3xl font-bold text-text-primary">{stats.inQueue}</span>
          <span className="text-[10px] text-text-secondary">patients waiting</span>
        </div>
      </div>

      <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Avg Waiting Time</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-3xl font-bold text-text-primary">~{stats.avgWait}m</span>
          <span className="text-[10px] text-text-secondary">minutes estimate</span>
        </div>
      </div>

      <div className={`border rounded-xl p-4 flex flex-col justify-between shadow-sm transition-all duration-300 ${
        stats.redFlags > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-surface-border'
      }`}>
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
          <span>Critical Red Flags</span>
          {stats.redFlags > 0 && <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />}
        </span>
        <div className="flex items-baseline justify-between mt-2">
          <span className={`text-3xl font-bold ${stats.redFlags > 0 ? 'text-red-700 animate-pulse' : 'text-text-primary'}`}>
            {stats.redFlags}
          </span>
          <span className={`text-[10px] font-semibold ${stats.redFlags > 0 ? 'text-red-700' : 'text-text-secondary'}`}>
            {stats.redFlags > 0 ? 'NEEDS CLINICAL CALL' : 'no unconfirmed cases'}
          </span>
        </div>
      </div>

      <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col justify-between shadow-sm">
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Seen This Shift</span>
        <div className="flex items-baseline justify-between mt-2">
          <span className="text-3xl font-bold text-text-primary">{stats.seenToday}</span>
          <span className="text-[10px] text-text-secondary">completed patients</span>
        </div>
      </div>
    </div>
  );
}
