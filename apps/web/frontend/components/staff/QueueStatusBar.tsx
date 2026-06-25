'use client';

import React from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Clock, Stethoscope, CheckCircle } from 'lucide-react';
import type { QueueFilter } from '@/types/queue';
import type { Patient } from '@/types/patient';

interface QueueStatusBarProps {
  patients: Patient[];
  activeFilter: QueueFilter;
  onFilterChange: (filter: QueueFilter) => void;
}

interface StatusCount {
  label: string;
  key: QueueFilter;
  count: number;
  icon: React.ReactNode;
  color: string;
  activeColor: string;
  bgColor: string;
}

export function QueueStatusBar({ patients, activeFilter, onFilterChange }: QueueStatusBarProps) {
  const waiting = patients.filter((p) => p.status === 'WAITING' || p.status === 'ESCALATED').length;
  const inProgress = patients.filter((p) => p.status === 'IN_PROGRESS').length;
  const completed = patients.filter((p) => p.status === 'COMPLETED').length;
  const escalated = patients.filter((p) => p.status === 'ESCALATED').length;
  const total = patients.length;

  const statusItems: StatusCount[] = [
    {
      label: 'All',
      key: 'all',
      count: total,
      icon: null,
      color: 'text-slate-600',
      activeColor: 'bg-slate-900 text-white',
      bgColor: 'bg-slate-100',
    },
    {
      label: 'Waiting',
      key: 'WAITING',
      count: waiting,
      icon: <Clock className="w-3.5 h-3.5" />,
      color: 'text-amber-700',
      activeColor: 'bg-amber-600 text-white',
      bgColor: 'bg-amber-50',
    },
    {
      label: 'In Progress',
      key: 'IN_PROGRESS',
      count: inProgress,
      icon: <Stethoscope className="w-3.5 h-3.5" />,
      color: 'text-blue-700',
      activeColor: 'bg-blue-600 text-white',
      bgColor: 'bg-blue-50',
    },
    {
      label: 'Completed',
      key: 'COMPLETED',
      count: completed,
      icon: <CheckCircle className="w-3.5 h-3.5" />,
      color: 'text-emerald-700',
      activeColor: 'bg-emerald-600 text-white',
      bgColor: 'bg-emerald-50',
    },
    {
      label: 'Escalated',
      key: 'red_flag',
      count: escalated,
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
      color: 'text-red-700',
      activeColor: 'bg-red-600 text-white',
      bgColor: 'bg-red-50',
    },
  ];

  return (
    <div className="bg-white rounded-lg border border-surface-border p-3 shadow-sm">
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
        {statusItems.map((item) => {
          const isActive = activeFilter === item.key;
          const hasCount = item.count > 0;

          return (
            <motion.button
              key={item.key}
              onClick={() => onFilterChange(item.key)}
              whileTap={{ scale: 0.95 }}
              className={`
                relative flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold
                transition-all duration-200 shrink-0 border
                ${isActive
                  ? `${item.activeColor} border-transparent shadow-sm`
                  : `${item.bgColor} ${item.color} border-transparent hover:opacity-80`
                }
                ${item.key === 'red_flag' && escalated > 0 && !isActive ? 'animate-pulse ring-2 ring-red-300' : ''}
              `}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
              {hasCount && (
                <motion.span
                  key={item.count}
                  initial={{ scale: 1.4 }}
                  animate={{ scale: 1 }}
                  className={`
                    inline-flex items-center justify-center min-w-[20px] h-5 px-1.5
                    rounded-full text-xs font-bold
                    ${isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-white/80 text-current'
                    }
                  `}
                >
                  {item.count}
                </motion.span>
              )}
              {!hasCount && (
                <span className="text-current opacity-40 text-xs font-normal">—</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
