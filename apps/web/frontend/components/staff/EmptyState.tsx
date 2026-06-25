'use client';

import React from 'react';
import { CheckCircle } from 'lucide-react';

interface EmptyStateProps {
  onRefresh: () => void;
}

export function EmptyState({ onRefresh }: EmptyStateProps) {
  return (
    <div className="bg-white border border-surface-border rounded-lg py-12 px-6 text-center space-y-4 shadow-sm">
      <div className="w-12 h-12 rounded-full bg-brand-light text-brand flex items-center justify-center mx-auto">
        <CheckCircle className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-text-primary text-lg">Triage queue is clear</h3>
        <p className="text-sm text-text-secondary max-w-[380px] mx-auto leading-relaxed">
          No active patients matched the active filter. New check-ins submitted on the patient panel will populate here immediately.
        </p>
      </div>
      <button
        onClick={onRefresh}
        className="px-4 py-2.5 border border-surface-border hover:bg-slate-50 transition text-sm font-bold rounded-lg text-text-secondary"
      >
        Refresh queue
      </button>
    </div>
  );
}
