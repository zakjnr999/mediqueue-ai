'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import type { Patient, PatientPriority } from '@/types/patient';

interface PriorityModalProps {
  patient: Patient | null;
  overridePriority: PatientPriority;
  overrideReason: string;
  isSaving: boolean;
  onPriorityChange: (p: PatientPriority) => void;
  onReasonChange: (reason: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export function PriorityModal({
  patient,
  overridePriority,
  overrideReason,
  isSaving,
  onPriorityChange,
  onReasonChange,
  onSave,
  onClose,
}: PriorityModalProps) {
  if (!patient) return null;

  const options: { value: PatientPriority; label: string; description: string }[] = [
    { value: 'minor', label: 'Minor Priority', description: 'Stable condition. Routine clinical assessment queue.' },
    { value: 'moderate', label: 'Moderate Priority', description: 'Requires secondary nurse screening. Checked periodically.' },
    { value: 'urgent', label: 'Urgent Priority', description: 'Immediate examination. Pushes to head of waiting list.' },
  ];

  return (
    <Modal isOpen={!!patient} onClose={onClose} title="Override Queue Priority">
      <div className="space-y-1.5">
        <p className="text-xs text-text-tertiary">Patient name</p>
        <p className="text-sm font-semibold text-text-primary">{patient.name} ({patient.queueNumber})</p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-bold text-text-secondary uppercase">Set Priority To</label>
        <div className="space-y-1.5">
          {options.map(opt => (
            <label
              key={opt.value}
              className="flex items-center gap-2.5 p-2.5 rounded-lg border border-surface-border hover:bg-slate-50 cursor-pointer text-xs"
            >
              <input
                type="radio"
                name="overridePriority"
                checked={overridePriority === opt.value}
                onChange={() => onPriorityChange(opt.value)}
                className="text-brand focus:ring-brand"
              />
              <div>
                <p className="font-semibold text-text-primary">{opt.label}</p>
                <p className="text-[10px] text-text-tertiary">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-bold text-text-secondary uppercase">Override Reason / Justification</label>
        <textarea
          value={overrideReason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="e.g. Patient appears more distressed than described, high age and fall risk."
          className="w-full border border-surface-border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand h-16 resize-none"
        />
      </div>

      <div className="flex gap-2.5 pt-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 border border-surface-border rounded-lg text-xs font-bold hover:bg-slate-50 text-text-secondary"
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="px-4 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-xs font-bold transition shadow-sm"
        >
          {isSaving ? 'Saving...' : 'Confirm Override'}
        </button>
      </div>
    </Modal>
  );
}
