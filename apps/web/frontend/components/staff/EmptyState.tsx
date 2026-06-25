'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';

interface EmptyStateProps {
  onRefresh: () => void;
}

export function EmptyState({ onRefresh }: EmptyStateProps) {
  return (
    <div className="bg-white border border-surface-border rounded-xl py-12 px-6 text-center space-y-4 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center mx-auto">
        <CheckCircle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-text-primary text-base">Triage Queue is Clear</h3>
        <p className="text-xs text-text-secondary max-w-[340px] mx-auto">
          No active patients matched the active filter. New check-ins submitted on the patient panel will populate here immediately.
        </p>
      </div>
      <button
        onClick={onRefresh}
        className="px-4 py-2 border border-surface-border hover:bg-slate-50 transition text-xs font-bold rounded-lg text-text-secondary"
      >
        Refresh Queue
      </button>
    </div>
  );
}
