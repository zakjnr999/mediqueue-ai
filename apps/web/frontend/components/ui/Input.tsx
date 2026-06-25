'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, icon, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-semibold text-text-secondary">{label}</label>
      )}
      <div className="relative">
        {icon && <span className="absolute left-3.5 top-3.5 text-slate-400">{icon}</span>}
        <input
          {...props}
          className={`w-full border rounded-lg ${icon ? 'pl-10 pr-3.5' : 'px-3.5'} py-3 text-base focus:outline-none focus:ring-2 focus:ring-brand ${
            error ? 'border-red-500 focus:ring-red-500' : 'border-surface-border'
          } ${className}`}
        />
      </div>
      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-semibold text-text-secondary">{label}</label>
      )}
      <select
        {...props}
        className={`w-full border border-surface-border rounded-lg px-3.5 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-brand ${className}`}
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
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-semibold text-text-secondary">{label}</label>
      )}
      <textarea
        {...props}
        className={`w-full border border-surface-border rounded-lg p-3.5 text-base focus:outline-none focus:ring-2 focus:ring-brand resize-none ${className}`}
      />
    </div>
  );
}
