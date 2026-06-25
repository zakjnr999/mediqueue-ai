'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
}

export function Card({ children, className = '', padding = true }: CardProps) {
  return (
    <div className={`bg-white border border-surface-border rounded-xl shadow-sm ${padding ? 'p-4' : ''} ${className}`}>
      {children}
    </div>
  );
}
