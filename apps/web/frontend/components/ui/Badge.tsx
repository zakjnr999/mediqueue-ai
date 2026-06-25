'use client';

import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ children, className = '', variant = 'default' }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-slate-100 text-text-secondary border border-slate-200',
    success: 'bg-urgency-minor-bg text-urgency-minor-text border border-urgency-minor-border',
    warning: 'bg-urgency-moderate-bg text-urgency-moderate-text border border-urgency-moderate-border',
    danger: 'bg-urgency-urgent-bg text-urgency-urgent-text border border-urgency-urgent-border',
    info: 'bg-urgency-progress-bg text-urgency-progress-text border border-urgency-progress-border',
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
