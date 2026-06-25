'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { QueueFilter, SortOption } from '@/types/queue';

interface FilterBarProps {
  activeFilter: QueueFilter;
  sortBy: SortOption;
  onFilterChange: (f: QueueFilter) => void;
  onSortChange: (s: SortOption) => void;
}

const FILTERS: { key: QueueFilter; label: string; icon?: boolean }[] = [
  { key: 'all', label: 'All patients' },
  { key: 'red_flag', label: 'Red Flags', icon: true },
  { key: 'WAITING', label: 'Waiting' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Completed' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'priority', label: 'Clinical priority' },
  { value: 'arrival', label: 'Newest arrivals' },
  { value: 'wait_time', label: 'Longest wait time' },
];

export function FilterBar({ activeFilter, sortBy, onFilterChange, onSortChange }: FilterBarProps) {
  return (
    <div className="bg-white border border-surface-border rounded-xl p-3 flex flex-wrap gap-3 items-center justify-between shadow-sm">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const isActive = activeFilter === f.key;
          let activeClass = 'bg-white hover:bg-slate-50 text-text-secondary border border-surface-border';
          if (isActive) {
            if (f.key === 'red_flag') activeClass = 'bg-red-100 text-red-700 border border-red-300';
            else if (f.key === 'WAITING') activeClass = 'bg-amber-100 text-amber-800 border border-amber-300';
            else if (f.key === 'IN_PROGRESS') activeClass = 'bg-blue-100 text-blue-800 border border-blue-300';
            else if (f.key === 'COMPLETED') activeClass = 'bg-slate-100 text-text-secondary border border-slate-300';
            else activeClass = 'bg-brand-light text-brand border border-brand/20';
          }
          return (
            <button
              key={f.key}
              onClick={() => onFilterChange(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeClass}`}
            >
              {f.icon && <AlertTriangle className="w-3.5 h-3.5" />}
              <span>{f.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">Sort by</span>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="border border-surface-border rounded-lg px-2.5 py-1 text-xs font-semibold bg-white text-text-secondary"
        >
          {SORT_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
