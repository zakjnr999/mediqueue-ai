'use client';

import React from 'react';
import { RefreshCw } from 'lucide-react';

interface StaffLoginProps {
  email: string;
  password: string;
  loginError: string;
  isLoggingIn: boolean;
  onEmailChange: (val: string) => void;
  onPasswordChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function StaffLogin({
  email,
  password,
  loginError,
  isLoggingIn,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: StaffLoginProps) {
  return (
    <div className="flex-1 flex items-center justify-center py-12 px-2">
      <div className="w-full max-w-[460px] bg-white rounded-lg shadow-md border border-surface-border p-6 sm:p-8 space-y-7">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-brand" />
            <span className="font-bold tracking-tight text-3xl">MediQueue AI</span>
          </div>
          <p className="text-sm font-bold uppercase text-text-secondary">Staff clinical portal</p>
          <p className="text-base text-text-secondary leading-relaxed">Sign in with your clinic credentials to manage today&apos;s queue.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-secondary">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className="w-full border border-surface-border rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-text-secondary">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full border border-surface-border rounded-lg px-3.5 py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand"
              required
            />
          </div>

          {loginError && (
            <p className="text-sm text-red-600 font-semibold">{loginError}</p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-3.5 rounded-lg text-lg transition shadow shadow-brand/10 flex items-center justify-center gap-2 disabled:bg-slate-300"
          >
            {isLoggingIn ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <span>Sign in to shift</span>
            )}
          </button>
        </form>

        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-sm text-text-secondary leading-relaxed">
          <p className="font-semibold text-brand mb-1">Clinical staff access</p>
          <p>Use the account issued for this Cognito staff user pool.</p>
        </div>
      </div>
    </div>
  );
}
