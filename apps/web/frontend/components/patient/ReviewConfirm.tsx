'use client';

import React from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Edit, RefreshCw, Clock } from 'lucide-react';
import { SYMPTOM_LIST } from '@/constants';
import type { PatientFormState } from '@/types/patient';

interface ReviewConfirmProps {
  form: PatientFormState;
  isSubmitting: boolean;
  onBack: () => void;
  onEditStep: (step: 'P1' | 'P2') => void;
  onSubmit: () => void;
}

export function ReviewConfirm({ form, isSubmitting, onBack, onEditStep, onSubmit }: ReviewConfirmProps) {
  return (
    <motion.div
      key="p3"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col justify-between"
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-text-primary">Review details</h2>
          <p className="text-base text-text-secondary">Please verify all info before submitting check-in.</p>
        </div>

        <div className="border border-surface-border rounded-lg p-4 space-y-3.5 bg-white shadow-sm relative">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="text-sm font-bold text-brand uppercase">Personal details</span>
            <button onClick={() => onEditStep('P1')} className="text-slate-400 hover:text-brand transition p-1 rounded-md hover:bg-slate-100" aria-label="Edit personal details">
              <Edit className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
            <div>
              <p className="text-text-tertiary">Name</p>
              <p className="font-semibold text-text-primary">{form.name}</p>
            </div>
            <div>
              <p className="text-text-tertiary">Phone</p>
              <p className="font-semibold text-text-primary">{form.phone}</p>
            </div>
            <div>
              <p className="text-text-tertiary">Age</p>
              <p className="font-semibold text-text-primary">{form.age} years</p>
            </div>
            <div>
              <p className="text-text-tertiary">Sex</p>
              <p className="font-semibold text-text-primary">{form.sex || 'Not specified'}</p>
            </div>
          </div>
        </div>

        <div className="border border-surface-border rounded-lg p-4 space-y-3.5 bg-white shadow-sm relative">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <span className="text-sm font-bold text-brand uppercase">Symptoms and severity</span>
            <button onClick={() => onEditStep('P2')} className="text-slate-400 hover:text-brand transition p-1 rounded-md hover:bg-slate-100" aria-label="Edit symptoms">
              <Edit className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-text-tertiary">Selected Symptoms</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {form.symptoms.length > 0 ? (
                  form.symptoms.map(sId => {
                    const match = SYMPTOM_LIST.find(s => s.id === sId);
                    return (
                      <span key={sId} className="bg-slate-100 text-text-secondary px-2.5 py-1 rounded-md text-sm font-medium">
                        {match ? match.label : sId}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-text-tertiary italic">None selected</span>
                )}
              </div>
            </div>

            {form.freeText && (
              <div>
                <p className="text-text-tertiary">Description</p>
                <p className="text-text-secondary mt-1 leading-relaxed bg-slate-50 p-3 rounded-md italic text-sm">
                  &ldquo;{form.freeText}&rdquo;
                </p>
              </div>
            )}

            <div>
              <p className="text-text-tertiary">Self-rated urgency</p>
              <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold uppercase ${
                form.selfUrgency === 'Urgent'
                  ? 'bg-urgency-urgent-bg text-urgency-urgent-text'
                  : form.selfUrgency === 'Moderate'
                  ? 'bg-urgency-moderate-bg text-urgency-moderate-text'
                  : 'bg-urgency-minor-bg text-urgency-minor-text'
              }`}>
                {form.selfUrgency}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200/60 rounded-lg p-3.5 flex gap-3 text-sm text-text-secondary leading-relaxed">
          <Clock className="w-4 h-4 text-brand shrink-0 mt-0.5" />
          <span>A nurse will confirm triage urgency after check-in. If your condition deteriorates, tell clinical staff directly.</span>
        </div>
      </div>

      <div className="flex gap-3 pt-6">
        <button
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 bg-slate-100 hover:bg-slate-200 text-text-primary font-semibold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition text-base"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          onClick={onSubmit}
          disabled={isSubmitting}
          className="flex-1 bg-brand hover:bg-brand-dark disabled:bg-slate-300 text-white font-semibold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-all shadow shadow-brand/20 hover:shadow-md text-base"
        >
          {isSubmitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Checking you in...</span>
            </>
          ) : (
            <>
              <span>Submit check-in</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </motion.div>
  );
}
