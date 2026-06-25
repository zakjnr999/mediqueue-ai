'use client';

import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight } from 'lucide-react';

interface LandingProps {
  onBeginCheckin: () => void;
  statusCheckQueueNum: string;
  statusCheckError: string;
  onStatusCheckChange: (val: string) => void;
  onStatusCheckSubmit: (e: React.FormEvent) => void;
}

export function Landing({
  onBeginCheckin,
  statusCheckQueueNum,
  statusCheckError,
  onStatusCheckChange,
  onStatusCheckSubmit,
}: LandingProps) {
  return (
    <motion.div
      key="p0"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col justify-between"
    >
      <div className="space-y-6">
        <div className="text-center space-y-2 py-4">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Welcome to Ridge Regional clinic
          </h1>
          <p className="text-sm text-text-secondary">
            Check in virtually to secure your queue priority. We use AI clinical insights to categorize urgent cases first.
          </p>
        </div>

        <div className="bg-brand-light rounded-xl p-5 border border-brand/20 flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-brand tracking-wider uppercase">Live Queue Stat</p>
            <p className="text-sm text-brand-dark font-medium">Patients waiting currently</p>
          </div>
          <span className="text-3xl font-extrabold text-brand-dark">14</span>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={onBeginCheckin}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
          >
            <span>Begin check-in</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-surface-border pt-6 mt-8 space-y-4">
        <p className="text-xs text-center font-medium text-text-secondary uppercase tracking-wider">Already checked in?</p>
        <form onSubmit={onStatusCheckSubmit} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. A-012"
              value={statusCheckQueueNum}
              onChange={(e) => onStatusCheckChange(e.target.value)}
              className="flex-1 border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand uppercase"
            />
            <button
              type="submit"
              className="bg-slate-100 hover:bg-slate-200 text-text-primary px-4 py-2 rounded-lg text-xs font-semibold transition"
            >
              Check Status
            </button>
          </div>
          {statusCheckError && (
            <p className="text-[11px] text-red-600 font-medium">{statusCheckError}</p>
          )}
        </form>
      </div>
    </motion.div>
  );
}
