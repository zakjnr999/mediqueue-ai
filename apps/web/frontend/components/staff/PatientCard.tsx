'use client';

import React from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle, ChevronUp, ChevronDown, CheckCircle, Sparkles, Stethoscope, MoreHorizontal,
} from 'lucide-react';
import { SYMPTOM_LIST } from '@/constants';
import type { Patient, PatientPriority } from '@/types/patient';

interface PatientCardProps {
  patient: Patient;
  isExpanded: boolean;
  currentTime: number;
  staffNotesInput: string;
  onToggleExpand: () => void;
  onConfirmPriority: () => void;
  onOpenOverride: () => void;
  onUpdateStatus: (status: 'waiting' | 'in_progress' | 'completed' | 'escalated') => void;
  onSaveNotes: (notes: string) => void;
  onStaffNotesChange: (val: string) => void;
}

function getPriorityColors(pClass: string, isEsc: boolean) {
  if (isEsc) return { bg: 'bg-urgency-urgent-bg', border: 'border-red-400', text: 'text-urgency-urgent-text' };
  if (pClass === 'urgent') return { bg: 'bg-urgency-urgent-bg', border: 'border-urgency-urgent-border', text: 'text-urgency-urgent-text' };
  if (pClass === 'moderate') return { bg: 'bg-urgency-moderate-bg', border: 'border-urgency-moderate-border', text: 'text-urgency-moderate-text' };
  return { bg: 'bg-urgency-minor-bg', border: 'border-urgency-minor-border', text: 'text-urgency-minor-text' };
}

export function PatientCard({
  patient,
  isExpanded,
  currentTime,
  staffNotesInput,
  onToggleExpand,
  onConfirmPriority,
  onOpenOverride,
  onUpdateStatus,
  onSaveNotes,
  onStaffNotesChange,
}: PatientCardProps) {
  const priority = patient.confirmedPriority || patient.aiSuggestedPriority;
  const priorityStyles = getPriorityColors(priority, patient.status === 'escalated');
  const arrivalTime = new Date(patient.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const minutesElapsed = currentTime > 0
    ? Math.round((currentTime - new Date(patient.createdAt).getTime()) / (60 * 1000))
    : 0;

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-all duration-300 ${
        patient.status === 'escalated' ? 'border-red-500 bg-red-50/10' : isExpanded ? 'border-brand' : 'border-surface-border'
      }`}
    >
      {patient.status === 'escalated' && (
        <div className="bg-red-600 text-white text-[10px] font-bold tracking-widest uppercase py-1 px-4 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Escalated — Immediate attention required</span>
          </span>
          <span className="bg-red-800 text-white px-2 py-0.5 rounded text-[9px]">CRITICAL</span>
        </div>
      )}

      <div
        onClick={onToggleExpand}
        className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${priorityStyles.bg} ${priorityStyles.border} ${priorityStyles.text}`}>
            {patient.status === 'escalated' ? <AlertTriangle className="w-5 h-5 text-red-600" /> :
             patient.status === 'in_progress' ? <Stethoscope className="w-5 h-5 text-blue-600" /> :
             priority === 'urgent' ? <AlertTriangle className="w-5 h-5" /> :
             priority === 'moderate' ? <MoreHorizontal className="w-5 h-5" /> :
             <CheckCircle className="w-5 h-5" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-text-primary truncate">{patient.name}</h3>
              {patient.isRedFlag && (
                <span className="bg-red-100 text-red-700 px-1.5 py-0.5 text-[9px] font-bold rounded flex items-center gap-0.5 animate-pulse shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>RED FLAG</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-mono font-bold text-brand-dark text-[12px]">{patient.queueNumber}</span>
              <span>•</span>
              <span>{patient.sex}, {patient.age}y</span>
              <span>•</span>
              <span>Arrived {arrivalTime} ({minutesElapsed}m ago)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            patient.status === 'completed' ? 'bg-urgency-done-bg text-urgency-done-text border border-slate-200' :
            patient.status === 'in_progress' ? 'bg-urgency-progress-bg text-urgency-progress-text border border-blue-200' :
            patient.status === 'escalated' ? 'bg-red-100 text-red-800 border border-red-300' :
            'bg-urgency-moderate-bg text-urgency-moderate-text border border-amber-200'
          }`}>
            {patient.status === 'completed' ? 'Completed' :
             patient.status === 'in_progress' ? 'Attending' :
             patient.status === 'escalated' ? 'Escalated' : 'Waiting'}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-surface-border p-4 bg-slate-50/60 space-y-4">
          {/* AI Clinical Triage Summary */}
          <div className="bg-white rounded-xl border border-surface-border p-4 shadow-inner relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand" />
                <span className="text-xs font-bold text-brand uppercase tracking-wider">AI Clinical Triage Summary</span>
              </div>
              <span className="text-[10px] font-mono bg-brand-light text-brand px-1.5 py-0.5 rounded font-bold">GEMINI AI</span>
            </div>

            <p className="text-xs text-text-primary leading-relaxed">{patient.aiSummary}</p>

            <div className="grid grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-100 text-[11px]">
              <div>
                <span className="text-text-tertiary">AI-Suggested Priority:</span>
                <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  patient.aiSuggestedPriority === 'urgent' ? 'bg-red-50 text-red-700' :
                  patient.aiSuggestedPriority === 'moderate' ? 'bg-amber-50 text-amber-700' :
                  'bg-teal-50 text-teal-700'
                }`}>
                  {patient.aiSuggestedPriority}
                </span>
              </div>
              <div>
                <span className="text-text-tertiary">Confirmed Priority:</span>
                <span className="ml-2 font-bold text-text-primary">
                  {patient.confirmedPriority ? (
                    <span className="text-brand uppercase text-[10px] bg-brand-light px-2 py-0.5 rounded">
                      {patient.confirmedPriority} (Manual)
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">Not confirmed yet</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Patient Details */}
          <div className="bg-white rounded-xl border border-surface-border p-4 text-xs space-y-3 shadow-inner">
            <h4 className="font-bold text-[11px] text-text-secondary uppercase tracking-widest border-b border-slate-100 pb-1.5">Full Intake Specifications</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-text-tertiary">Patient Contact</p><p className="font-semibold text-text-primary">{patient.phone}</p></div>
              <div><p className="text-text-tertiary">Demographics</p><p className="font-semibold text-text-primary">{patient.sex || 'Unknown'}, {patient.age} years old</p></div>
              <div><p className="text-text-tertiary">Self-assessed Urgency</p><p className="font-semibold text-text-primary uppercase">{patient.selfUrgency}</p></div>
              <div><p className="text-text-tertiary">Arrival Timestamp</p><p className="font-semibold text-text-primary">{new Date(patient.createdAt).toLocaleString()}</p></div>
            </div>

            <div className="space-y-1 pt-2">
              <p className="text-text-tertiary">Symptom Checklist Selected</p>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {patient.symptoms.map(s => {
                  const match = SYMPTOM_LIST.find(sym => sym.id === s);
                  return (
                    <span key={s} className="bg-slate-100 text-text-secondary font-medium px-2 py-0.5 rounded text-[11px]">
                      {match ? match.label : s}
                    </span>
                  );
                })}
              </div>
            </div>

            {patient.freeText && (
              <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                <p className="text-text-tertiary font-medium">Patient Description Notes</p>
                <p className="bg-slate-50 p-2.5 rounded text-text-secondary leading-relaxed italic text-[11px]">
                  &ldquo;{patient.freeText}&rdquo;
                </p>
              </div>
            )}

            {patient.overrideReason && (
              <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 mt-2 text-[11px]">
                <p className="font-bold text-amber-800">Priority Override Log:</p>
                <p className="text-amber-900 mt-0.5">{patient.overrideReason}</p>
              </div>
            )}

            {patient.status === 'in_progress' && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="block text-xs font-bold text-text-secondary uppercase">Clinical Notes & Observations</label>
                <textarea
                  value={staffNotesInput}
                  onChange={(e) => onStaffNotesChange(e.target.value)}
                  placeholder="Enter physical observations, initial blood pressures, treatment notes..."
                  className="w-full border border-surface-border rounded-lg p-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand h-16"
                />
                <button
                  onClick={() => onSaveNotes(staffNotesInput)}
                  className="bg-brand hover:bg-brand-dark text-white px-3 py-1.5 rounded-lg text-[10px] font-bold"
                >
                  Save Clinical Note
                </button>
              </div>
            )}

            {patient.notes && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 mt-2 text-[11px]">
                <p className="font-bold text-blue-800">Preserved Consultation Notes:</p>
                <p className="text-blue-900 mt-0.5">{patient.notes}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-200/60 justify-end">
            {patient.status === 'waiting' && (
              <>
                <button
                  onClick={onConfirmPriority}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition"
                >
                  Confirm Priority
                </button>
                <button
                  onClick={onOpenOverride}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-text-secondary border border-surface-border hover:bg-slate-50 transition"
                >
                  Override Priority
                </button>
                <button
                  onClick={() => onUpdateStatus('in_progress')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition"
                >
                  Mark Attending
                </button>
                <button
                  onClick={() => onUpdateStatus('escalated')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 transition flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Escalate Critical</span>
                </button>
              </>
            )}

            {patient.status === 'escalated' && (
              <>
                <button
                  onClick={() => onUpdateStatus('in_progress')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition"
                >
                  Mark Attending
                </button>
                <button
                  onClick={() => onUpdateStatus('completed')}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                >
                  Mark Completed
                </button>
              </>
            )}

            {patient.status === 'in_progress' && (
              <button
                onClick={() => onUpdateStatus('completed')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
              >
                Mark Completed
              </button>
            )}

            {patient.status === 'completed' && (
              <span className="text-xs text-text-tertiary italic flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-brand" />
                <span>Consultation closed at {patient.completedAt ? new Date(patient.completedAt).toLocaleTimeString() : 'N/A'}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
