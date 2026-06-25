'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';
import { CLINIC_NAME } from '@/constants';

interface DashboardHeaderProps {
  isLoading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  userEmail: string;
}

/** Derive a display name and initials from an email address. */
function deriveUserInfo(email: string): { initials: string; displayName: string } {
  const local = email.split('@')[0] || email;
  const parts = local.split(/[._-]/).filter(Boolean);
  const displayName = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
  const initials = parts
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
    .slice(0, 2);
  return { initials: initials || '??', displayName: displayName || email };
}

export function DashboardHeader({ isLoading, onRefresh, onLogout, userEmail }: DashboardHeaderProps) {
  const { initials, displayName } = deriveUserInfo(userEmail);
  return (
    <div className="bg-white rounded-xl border border-surface-border p-4 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        <span className="w-3.5 h-3.5 rounded-full bg-brand" />
        <div>
          <h1 className="font-bold text-lg text-text-primary flex items-center gap-2">
            <span>MediQueue AI</span>
            <span className="text-xs font-semibold bg-brand-light text-brand px-2 py-0.5 rounded-full">{CLINIC_NAME}</span>
          </h1>
          <p className="text-xs text-text-secondary">Emergency Triage & Clinical Prioritization Dashboard</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-800">● Live Connection</span>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 border border-surface-border rounded-lg bg-white hover:bg-slate-50 transition text-text-secondary relative active:scale-95"
          title="Manual Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand' : ''}`} />
        </button>

        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-brand text-white flex items-center justify-center font-bold text-sm">
            {initials}
          </span>
          <div className="hidden md:block">
            <p className="text-xs font-bold text-text-primary">{displayName}</p>
            <button
              onClick={onLogout}
              className="text-[10px] text-red-600 font-semibold hover:underline block"
            >
              Sign out of shift
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
