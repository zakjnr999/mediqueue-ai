'use client';

import React, { useState } from 'react';
import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Patient } from '@/types/patient';
import type { Stats } from '@/types/queue';
import { PriorityChart } from './PriorityChart';
import { ActivityTimeline } from './ActivityTimeline';
import { StatusBreakdown } from './StatusBreakdown';
import { MetricCards } from './MetricCards';

interface QueueAnalyticsProps {
  patients: Patient[];
  stats: Stats;
}

/**
 * QueueAnalytics — collapsible analytics panel combining three visual
 * components (PriorityChart, ActivityTimeline, StatusBreakdown) with
 * the existing MetricCards for a comprehensive ED pulse-check.
 *
 * Placed between MetricCards and QueueStatusBar in StaffDashboard.
 */
export function QueueAnalytics({ patients, stats }: QueueAnalyticsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <BarChart3 className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm font-semibold text-text-primary">Queue Analytics</span>
          <span className="text-[11px] text-text-tertiary bg-slate-100 px-2 py-0.5 rounded-full">
            {patients.length} patients
          </span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        </motion.div>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="analytics-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 space-y-6 border-t border-slate-100 pt-4">
              {/* Metric cards row (compact variant) */}
              <MetricCards stats={stats} />

              {/* Three-column grid for charts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Priority donut */}
                <div className="bg-slate-50/60 rounded-lg p-3.5 border border-slate-100">
                  <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                    Priority Distribution
                  </p>
                  <PriorityChart patients={patients} />
                </div>

                {/* Activity timeline */}
                <div className="bg-slate-50/60 rounded-lg p-3.5 border border-slate-100">
                  <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                    Arrival Timeline
                  </p>
                  <ActivityTimeline patients={patients} />
                </div>

                {/* Status breakdown */}
                <div className="bg-slate-50/60 rounded-lg p-3.5 border border-slate-100">
                  <p className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider mb-3">
                    Status Breakdown
                  </p>
                  <StatusBreakdown patients={patients} />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
