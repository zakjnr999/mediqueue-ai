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
  patientsWaiting: number | null;
}

export function Landing({
  onBeginCheckin,
  statusCheckQueueNum,
  statusCheckError,
  onStatusCheckChange,
  onStatusCheckSubmit,
  patientsWaiting,
}: LandingProps) {
  return (
    <motion.div
      key="p0"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col justify-between"
    >
      <div className="space-y-7">
        <div className="text-center space-y-3 py-5">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary leading-tight">
            Welcome to Ridge Regional clinic
          </h1>
          <p className="text-base sm:text-lg text-text-secondary leading-relaxed max-w-[440px] mx-auto">
            Check in virtually to secure your queue priority. We use AI clinical insights to categorize urgent cases first.
          </p>
        </div>

        <div className="bg-brand-light rounded-lg p-5 sm:p-6 border border-brand/20 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-bold text-brand uppercase">Live queue</p>
            <p className="text-base text-brand-dark font-medium">
              {patientsWaiting === null ? 'Live count available to staff' : 'Patients waiting currently'}
            </p>
          </div>
          <span className="text-5xl font-extrabold text-brand-dark leading-none">
            {patientsWaiting ?? '—'}
          </span>
        </div>

        <div className="space-y-3 pt-4">
          <button
            onClick={onBeginCheckin}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-4 px-5 rounded-lg flex items-center justify-center gap-3 transition-all shadow-md hover:shadow-lg active:scale-[0.98] text-lg"
          >
            <span>Begin check-in</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="border-t border-surface-border pt-6 mt-8 space-y-4">
        <p className="text-sm text-center font-bold text-text-secondary uppercase">Already checked in?</p>
        <form onSubmit={onStatusCheckSubmit} className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="e.g. A-012"
              value={statusCheckQueueNum}
              onChange={(e) => onStatusCheckChange(e.target.value)}
              className="flex-1 border border-surface-border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand uppercase"
            />
            <button
              type="submit"
              className="bg-slate-100 hover:bg-slate-200 text-text-primary px-5 py-3 rounded-lg text-base font-semibold transition"
            >
              Check Status
            </button>
          </div>
          {statusCheckError && (
            <p className="text-sm text-red-600 font-medium">{statusCheckError}</p>
          )}
        </form>
      </div>
    </motion.div>
  );
}
