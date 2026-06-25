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
    <div className="flex-1 flex items-center justify-center py-12">
      <div className="w-full max-w-[400px] bg-white rounded-xl shadow-md border border-surface-border p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-brand" />
            <span className="font-bold tracking-tight text-xl">MediQueue AI</span>
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">Staff Clinical Portal</p>
          <p className="text-xs text-text-tertiary">Please authenticate with credentials to access the queue manager.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-secondary uppercase">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-text-secondary uppercase">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              required
            />
          </div>

          {loginError && (
            <p className="text-xs text-red-600 font-semibold">{loginError}</p>
          )}

          <button
            type="submit"
            disabled={isLoggingIn}
            className="w-full bg-brand hover:bg-brand-dark text-white font-semibold py-2.5 rounded-lg text-sm transition shadow shadow-brand/10 flex items-center justify-center gap-2"
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

        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] text-text-secondary">
          <p className="font-semibold text-brand mb-1">Shift Demo Account:</p>
          <p>Email: <code className="font-mono bg-slate-200 px-1 rounded">nurse@healthcentre.gh</code></p>
          <p>Password: <code className="font-mono bg-slate-200 px-1 rounded">password123</code></p>
        </div>
      </div>
    </div>
  );
}
