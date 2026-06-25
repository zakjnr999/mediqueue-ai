'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</label>
      )}
      <div className="relative">
        {icon && <span className="absolute left-3 top-3 text-slate-400">{icon}</span>}
        <input
          {...props}
          className={`w-full border rounded-lg ${icon ? 'pl-9 pr-3' : 'px-3'} py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-surface-border'
          } ${className}`}
        />
      </div>
      {error && <p className="text-[11px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</label>
      )}
      <select
        {...props}
        className={`w-full border border-surface-border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand ${className}`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

export function TextArea({ label, className = '', ...props }: TextAreaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">{label}</label>
      )}
      <textarea
        {...props}
        className={`w-full border border-surface-border rounded-lg p-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand resize-none ${className}`}
      />
    </div>
  );
}
