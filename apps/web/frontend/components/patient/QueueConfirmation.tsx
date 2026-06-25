'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Phone, RefreshCw, AlertTriangle } from 'lucide-react';
import type { CheckinResult } from '@/types/patient';

interface QueueConfirmationProps {
  result: CheckinResult;
  phone: string;
  onReset: () => void;
}

export function QueueConfirmation({ result, phone, onReset }: QueueConfirmationProps) {
  return (
    <motion.div
      key="p4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 text-center"
    >
      <div className="space-y-1 pt-2">
        <h2 className="text-xl font-bold text-brand">You are checked in</h2>
        <p className="text-xs text-text-secondary">Please wait in the seating area. We will call you shortly.</p>
      </div>

      <div className="bg-brand-light/50 border border-brand/20 rounded-2xl p-6 space-y-4 max-w-[320px] mx-auto shadow-sm">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-brand uppercase tracking-wider">Your Queue Number</p>
          <p className="text-5xl font-mono font-extrabold text-brand tracking-tight">
            {result.queueNumber}
          </p>
        </div>

        <div className="border-t border-brand/10 pt-3 flex justify-between items-center">
          <span className="text-xs text-text-secondary font-medium">Estimated wait</span>
          <span className="text-base font-bold text-text-primary">
            {result.estimatedWaitMinutes > 0 ? `~ ${result.estimatedWaitMinutes} minutes` : 'Immediate'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-xs text-text-secondary font-medium">Triage Status</span>
          <span className={`px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            result.status === 'COMPLETED'
              ? 'bg-urgency-done-bg text-urgency-done-text'
              : result.status === 'IN_PROGRESS'
              ? 'bg-urgency-progress-bg text-urgency-progress-text'
              : 'bg-urgency-moderate-bg text-urgency-moderate-text'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              result.status === 'COMPLETED' ? 'bg-slate-400' :
              result.status === 'IN_PROGRESS' ? 'bg-blue-500 animate-pulse' : 'bg-amber-500'
            }`} />
            {result.status === 'COMPLETED' ? 'Completed' :
             result.status === 'IN_PROGRESS' ? 'Attending' : 'Waiting'}
          </span>
        </div>

        {result.queuePosition !== undefined && result.status === 'WAITING' && (
          <div className="border-t border-brand/10 pt-3 flex justify-between items-center text-xs">
            <span className="text-text-secondary">Queue Position</span>
            <span className="font-bold text-brand-dark">#{result.queuePosition} ahead</span>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-surface-border rounded-xl p-4 text-left text-xs text-text-secondary space-y-3 max-w-[360px] mx-auto">
        <div className="flex gap-3">
          <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p>We will send an SMS to <span className="font-semibold text-text-primary">{phone || 'your phone'}</span> when a consultant is ready.</p>
        </div>
        <div className="flex gap-3 border-t border-slate-200/60 pt-3">
          <RefreshCw className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 animate-spin-slow" />
          <p>This panel refreshes automatically to reflect your clinical triage status changes.</p>
        </div>
        <div className="flex gap-3 border-t border-slate-200/60 pt-3 text-red-700 bg-red-50/50 p-2 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <p className="font-semibold">If your condition worsens (difficulty breathing, dizziness, nausea) notify the receptionist immediately.</p>
        </div>
      </div>

      <div className="pt-4">
        <button
          onClick={onReset}
          className="text-brand hover:text-brand-dark font-semibold text-xs border border-brand/20 bg-brand-light px-5 py-2 rounded-lg transition hover:bg-brand-light/80"
        >
          Register New Patient
        </button>
      </div>
    </motion.div>
  );
}
