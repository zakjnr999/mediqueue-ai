'use client';

import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SYMPTOM_LIST } from '@/constants';
import type { PatientFormState } from '@/types/patient';

interface SymptomSelectionProps {
  form: PatientFormState;
  onUpdate: (patch: Partial<PatientFormState>) => void;
  onBack: () => void;
  onReview: () => void;
}

export function SymptomSelection({ form, onUpdate, onBack, onReview }: SymptomSelectionProps) {
  const toggleSymptom = (id: string) => {
    const updated = form.symptoms.includes(id)
      ? form.symptoms.filter(s => s !== id)
      : [...form.symptoms, id];
    onUpdate({ symptoms: updated });
  };

  return (
    <motion.div
      key="p2"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col justify-between"
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">What brings you in today?</h2>
          <p className="text-base text-text-secondary">Select all symptoms that apply to you.</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {SYMPTOM_LIST.map((sym) => {
            const isSelected = form.symptoms.includes(sym.id);
            const IconComp = sym.icon;
            return (
              <button
                key={sym.id}
                onClick={() => toggleSymptom(sym.id)}
                className={`flex items-center gap-2.5 p-3.5 rounded-lg border text-left text-sm font-medium transition duration-200 select-none ${
                  isSelected
                    ? 'bg-urgency-minor-bg border-brand text-urgency-minor-text font-semibold'
                    : 'bg-white border-surface-border text-text-secondary hover:bg-slate-50'
                }`}
              >
                <IconComp className={`w-5 h-5 shrink-0 ${isSelected ? 'text-brand' : 'text-slate-400'}`} />
                <span>{sym.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-text-secondary">Describe in your own words</label>
          <textarea
            placeholder="e.g. Feel extremely dizzy when standing up, chest feels a bit tight, started about an hour ago..."
            maxLength={500}
            value={form.freeText}
            onChange={(e) => onUpdate({ freeText: e.target.value })}
            className="w-full border border-surface-border rounded-lg p-3.5 text-base focus:outline-none focus:ring-2 focus:ring-brand h-28 resize-none"
          />
          <div className="text-right text-xs text-text-tertiary">
            {form.freeText.length} / 500 characters
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-text-secondary">How urgent does this feel?</label>
          <div className="grid grid-cols-3 gap-2">
            {(['Minor', 'Moderate', 'Urgent'] as const).map((level) => (
              <button
                key={level}
                onClick={() => onUpdate({ selfUrgency: level })}
                className={`py-3 px-3 rounded-lg border text-sm font-semibold transition capitalize ${
                  form.selfUrgency === level
                    ? level === 'Minor'
                      ? 'bg-urgency-minor-bg border-urgency-minor-border text-urgency-minor-text'
                      : level === 'Moderate'
                      ? 'bg-urgency-moderate-bg border-urgency-moderate-border text-urgency-moderate-text'
                      : 'bg-urgency-urgent-bg border-urgency-urgent-border text-urgency-urgent-text'
                    : 'bg-white border-surface-border text-text-secondary hover:bg-slate-50'
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <p className="text-sm text-text-tertiary leading-relaxed">
            Your selection assists triage priority mapping, but nursing staff confirms final queue prioritization.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-6">
        <button
          onClick={onBack}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition text-base"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          onClick={onReview}
          className="flex-1 bg-brand hover:bg-brand-dark text-white font-semibold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow shadow-brand/20 hover:shadow-md text-base"
        >
          <span>Review</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
