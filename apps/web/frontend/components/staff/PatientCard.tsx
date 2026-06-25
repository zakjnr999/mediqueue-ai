'use client';

import React from 'react';
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
  onUpdateStatus: (status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED') => void;
  onEscalate?: () => void;
  onSaveNotes: (notes: string) => void;
  onStaffNotesChange: (val: string) => void;
}

function getPriorityColors(pClass: string, isEsc: boolean) {
  if (isEsc) return { bg: 'bg-urgency-urgent-bg', border: 'border-red-400', text: 'text-urgency-urgent-text' };
  if (pClass === 'HIGH') return { bg: 'bg-urgency-urgent-bg', border: 'border-urgency-urgent-border', text: 'text-urgency-urgent-text' };
  if (pClass === 'MEDIUM') return { bg: 'bg-urgency-moderate-bg', border: 'border-urgency-moderate-border', text: 'text-urgency-moderate-text' };
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
  onEscalate,
  onSaveNotes,
  onStaffNotesChange,
}: PatientCardProps) {
  const priority = patient.confirmedPriority || patient.aiSuggestedPriority;
  const priorityStyles = getPriorityColors(priority, patient.status === 'ESCALATED');
  const arrivalTime = new Date(patient.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const minutesElapsed = currentTime > 0
    ? Math.round((currentTime - new Date(patient.createdAt).getTime()) / (60 * 1000))
    : 0;
  const demographics = patient.sex ? `${patient.sex}, ${patient.age}y` : `${patient.age}y`;
  const contact = patient.phone || 'Available in patient details';

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border overflow-hidden transition-all duration-300 ${
        patient.status === 'ESCALATED' ? 'border-red-500 bg-red-50/10' : isExpanded ? 'border-brand' : 'border-surface-border'
      }`}
    >
      {patient.status === 'ESCALATED' && (
        <div className="bg-red-600 text-white text-xs font-bold uppercase py-2 px-4 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Escalated — Immediate attention required</span>
          </span>
          <span className="bg-red-800 text-white px-2 py-0.5 rounded text-xs">Critical</span>
        </div>
      )}

      <div
        onClick={onToggleExpand}
        className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/50 transition"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${priorityStyles.bg} ${priorityStyles.border} ${priorityStyles.text}`}>
            {patient.status === 'ESCALATED' ? <AlertTriangle className="w-5 h-5 text-red-600" /> :
             patient.status === 'IN_PROGRESS' ? <Stethoscope className="w-5 h-5 text-blue-600" /> :
             priority === 'HIGH' ? <AlertTriangle className="w-5 h-5" /> :
             priority === 'MEDIUM' ? <MoreHorizontal className="w-5 h-5" /> :
             <CheckCircle className="w-5 h-5" />}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-text-primary truncate">{patient.name}</h3>
              {patient.isRedFlag && (
                <span className="bg-red-100 text-red-700 px-2 py-0.5 text-xs font-bold rounded flex items-center gap-1 animate-pulse shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Red flag</span>
                </span>
              )}
            </div>
            <p className="text-sm text-text-secondary mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="font-mono font-bold text-brand-dark">{patient.queueNumber}</span>
              <span>•</span>
              <span>{demographics}</span>
              <span>•</span>
              <span>Arrived {arrivalTime} ({minutesElapsed}m ago)</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
            patient.status === 'COMPLETED' ? 'bg-urgency-done-bg text-urgency-done-text border border-slate-200' :
            patient.status === 'IN_PROGRESS' ? 'bg-urgency-progress-bg text-urgency-progress-text border border-blue-200' :
            patient.status === 'ESCALATED' ? 'bg-red-100 text-red-800 border border-red-300' :
            'bg-urgency-moderate-bg text-urgency-moderate-text border border-amber-200'
          }`}>
            {patient.status === 'COMPLETED' ? 'Completed' :
             patient.status === 'IN_PROGRESS' ? 'Attending' :
             patient.status === 'ESCALATED' ? 'Escalated' : 'Waiting'}
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-surface-border p-4 bg-slate-50/60 space-y-4">
          {/* AI Clinical Triage Summary */}
          <div className="bg-white rounded-lg border border-surface-border p-4 shadow-inner relative">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand" />
                <span className="text-sm font-bold text-brand uppercase">Clinical triage summary</span>
              </div>
              <span className="text-xs bg-brand-light text-brand px-2 py-1 rounded font-bold">Bedrock</span>
            </div>

            <p className="text-sm text-text-primary leading-relaxed">{patient.aiSummary}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 pt-3 border-t border-slate-100 text-sm">
              <div>
                <span className="text-text-tertiary">AI-Suggested Priority:</span>
                <span className={`ml-2 inline-block px-2 py-0.5 rounded text-xs font-bold uppercase ${
                  patient.aiSuggestedPriority === 'HIGH' ? 'bg-red-50 text-red-700' :
                  patient.aiSuggestedPriority === 'MEDIUM' ? 'bg-amber-50 text-amber-700' :
                  'bg-teal-50 text-teal-700'
                }`}>
                  {patient.aiSuggestedPriority}
                </span>
              </div>
              <div>
                <span className="text-text-tertiary">Confirmed Priority:</span>
                <span className="ml-2 font-bold text-text-primary">
                  {patient.confirmedPriority ? (
                    <span className="text-brand uppercase text-xs bg-brand-light px-2 py-0.5 rounded">
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
          <div className="bg-white rounded-lg border border-surface-border p-4 text-sm space-y-3 shadow-inner">
            <h4 className="font-bold text-sm text-text-secondary uppercase border-b border-slate-100 pb-1.5">Patient intake details</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className="text-text-tertiary">Patient Contact</p><p className="font-semibold text-text-primary">{contact}</p></div>
              <div><p className="text-text-tertiary">Demographics</p><p className="font-semibold text-text-primary">{patient.sex ? `${patient.sex}, ` : ''}{patient.age} years old</p></div>
              <div><p className="text-text-tertiary">Self-assessed Urgency</p><p className="font-semibold text-text-primary uppercase">{patient.selfUrgency}</p></div>
              <div><p className="text-text-tertiary">Arrival Timestamp</p><p className="font-semibold text-text-primary">{new Date(patient.createdAt).toLocaleString()}</p></div>
            </div>

            <div className="space-y-1 pt-2">
              <p className="text-text-tertiary">Symptom Checklist Selected</p>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {patient.symptoms.map(s => {
                  const match = SYMPTOM_LIST.find(sym => sym.id === s);
                  return (
                    <span key={s} className="bg-slate-100 text-text-secondary font-medium px-2.5 py-1 rounded text-sm">
                      {match ? match.label : s}
                    </span>
                  );
                })}
              </div>
            </div>

            {patient.freeText && (
              <div className="space-y-1.5 pt-1.5 border-t border-slate-100">
                <p className="text-text-tertiary font-medium">Patient Description Notes</p>
                <p className="bg-slate-50 p-2.5 rounded text-text-secondary leading-relaxed italic text-sm">
                  &ldquo;{patient.freeText}&rdquo;
                </p>
              </div>
            )}

            {patient.overrideReason && (
              <div className="bg-amber-50/50 border border-amber-100 rounded-lg p-2.5 mt-2 text-sm">
                <p className="font-bold text-amber-800">Priority override log:</p>
                <p className="text-amber-900 mt-0.5">{patient.overrideReason}</p>
              </div>
            )}

            {patient.status === 'IN_PROGRESS' && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <label className="block text-sm font-bold text-text-secondary">Clinical notes and observations</label>
                <textarea
                  value={staffNotesInput}
                  onChange={(e) => onStaffNotesChange(e.target.value)}
                  placeholder="Enter physical observations, initial blood pressures, treatment notes..."
                  className="w-full border border-surface-border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand h-20"
                />
                <button
                  onClick={() => onSaveNotes(staffNotesInput)}
                  className="bg-brand hover:bg-brand-dark text-white px-3 py-2 rounded-lg text-sm font-bold"
                >
                  Save Clinical Note
                </button>
              </div>
            )}

            {patient.notes && (
              <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-2.5 mt-2 text-sm">
                <p className="font-bold text-blue-800">Consultation notes:</p>
                <p className="text-blue-900 mt-0.5">{patient.notes}</p>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2.5 pt-2 border-t border-slate-200/60 justify-end">
            {patient.status === 'WAITING' && (
              <>
                <button
                  onClick={onConfirmPriority}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 transition"
                >
                  Confirm Priority
                </button>
                <button
                  onClick={onOpenOverride}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-white text-text-secondary border border-surface-border hover:bg-slate-50 transition"
                >
                  Override Priority
                </button>
                <button
                  onClick={() => onUpdateStatus('IN_PROGRESS')}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition"
                >
                  Mark Attending
                </button>
                <button
                  onClick={onEscalate}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-red-100 text-red-800 hover:bg-red-200 border border-red-300 transition flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Escalate Critical</span>
                </button>
              </>
            )}

            {patient.status === 'ESCALATED' && (
              <>
                <button
                  onClick={() => onUpdateStatus('IN_PROGRESS')}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200 transition"
                >
                  Mark Attending
                </button>
                <button
                  onClick={() => onUpdateStatus('COMPLETED')}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
                >
                  Mark Completed
                </button>
              </>
            )}

            {patient.status === 'IN_PROGRESS' && (
              <button
                onClick={() => onUpdateStatus('COMPLETED')}
                className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition"
              >
                Mark Completed
              </button>
            )}

            {patient.status === 'COMPLETED' && (
              <span className="text-sm text-text-tertiary italic flex items-center gap-1">
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
