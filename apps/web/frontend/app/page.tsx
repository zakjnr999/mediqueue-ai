'use client';

import React, { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { CheckCircle } from 'lucide-react';
import { useCheckin } from '@/hooks/use-checkin';
import { Landing } from '@/components/patient/Landing';
import { PersonalInfo } from '@/components/patient/PersonalInfo';
import { SymptomSelection } from '@/components/patient/SymptomSelection';
import { ReviewConfirm } from '@/components/patient/ReviewConfirm';
import { QueueConfirmation } from '@/components/patient/QueueConfirmation';
import { StaffDashboard } from '@/components/staff/StaffDashboard';
import { apiGet } from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { QueueStatsResponse } from '@/types/api';

export default function Home() {
  const [activePortal, setActivePortal] = useState<'patient' | 'staff'>('patient');
  const [patientsWaiting, setPatientsWaiting] = useState(0);

  // Fetch live queue count for the landing page
  useEffect(() => {
    apiGet<QueueStatsResponse>(ENDPOINTS.queue.stats, { timeout: 5000 })
      .then((res) => {
        if (res.success) setPatientsWaiting(res.data.inQueue);
      })
      .catch(() => {
        // Silent fail — landing shows 0 when backend is unreachable
      });
  }, []);

  // Patient portal hooks
  const {
    step: patientStep,
    setStep: setPatientStep,
    form: patientForm,
    errors,
    isSubmitting,
    result: checkinResult,
    statusCheckQueueNum,
    statusCheckError,
    updateForm,
    setStatusCheckQueueNum,
    handleP1Continue,
    handlePatientSubmit,
    handleStatusCheck,
    resetPatientFlow,
  } = useCheckin();

  return (
    <div className="min-h-screen bg-surface-grey flex flex-col antialiased font-sans">

      {/* PORTAL TOGGLE */}
      <div className="bg-slate-900 text-white px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 border-b border-slate-800 shrink-0 z-50">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-xs font-semibold tracking-wider text-slate-300 uppercase">Interactive Preview Sandbox</span>
        </div>
        <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
          <button
            onClick={() => setActivePortal('patient')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activePortal === 'patient' ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Patient Check-In Flow
          </button>
          <button
            onClick={() => setActivePortal('staff')}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${activePortal === 'staff' ? 'bg-brand text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Staff Dashboard Portal
          </button>
        </div>
      </div>

      {/* PATIENT PORTAL */}
      {activePortal === 'patient' && (
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white rounded-xl shadow-lg border border-surface-border overflow-hidden flex flex-col min-h-[580px]">

            <header className="px-5 py-4 border-b border-surface-border flex items-center justify-between bg-white">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-brand" />
                <span className="font-semibold tracking-tight text-text-primary text-lg">MediQueue AI</span>
              </div>
              <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded">Patient Intake</span>
            </header>

            {patientStep !== 'P0' && (
              <div className="px-5 py-3.5 bg-slate-50 border-b border-surface-border flex items-center justify-between">
                <div className="flex items-center w-full justify-between max-w-[280px] mx-auto text-xs font-medium">
                  {['P1', 'P2', 'P3', 'P4'].map((s, idx) => {
                    const stepNum = idx + 1;
                    const isCompleted = ['P2', 'P3', 'P4'].includes(s) && patientStep !== s
                      ? (patientStep === 'P2' ? false : idx < ['P1', 'P2', 'P3', 'P4'].indexOf(patientStep))
                      : false;
                    const isActive = patientStep === s;
                    return (
                      <React.Fragment key={s}>
                        {idx > 0 && (
                          <div className={`flex-1 h-[2px] mx-2 -mt-4 ${
                            ['P2', 'P3', 'P4'].includes(patientStep) && idx <= ['P1', 'P2', 'P3', 'P4'].indexOf(patientStep)
                              ? 'bg-brand'
                              : 'bg-slate-200'
                          }`} />
                        )}
                        <div className="flex flex-col items-center gap-1">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            isActive ? 'bg-brand text-white' :
                            isCompleted ? 'bg-brand-light text-brand' : 'bg-slate-200 text-slate-400'
                          }`}>
                            {isCompleted ? <CheckCircle className="w-4 h-4" /> : stepNum}
                          </span>
                          <span className="text-[10px] text-text-secondary">
                            {idx === 0 ? 'Info' : idx === 1 ? 'Symptoms' : 'Review'}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between">
              <AnimatePresence mode="wait">
                {patientStep === 'P0' && (
                  <Landing
                    key="p0"
                    onBeginCheckin={() => setPatientStep('P1')}
                    statusCheckQueueNum={statusCheckQueueNum}
                    statusCheckError={statusCheckError}
                    onStatusCheckChange={setStatusCheckQueueNum}
                    onStatusCheckSubmit={handleStatusCheck}
                    patientsWaiting={patientsWaiting}
                  />
                )}
                {patientStep === 'P1' && (
                  <PersonalInfo
                    key="p1"
                    form={patientForm}
                    errors={errors}
                    onUpdate={updateForm}
                    onContinue={handleP1Continue}
                    onBack={() => setPatientStep('P0')}
                  />
                )}
                {patientStep === 'P2' && (
                  <SymptomSelection
                    key="p2"
                    form={patientForm}
                    onUpdate={updateForm}
                    onBack={() => setPatientStep('P1')}
                    onReview={() => setPatientStep('P3')}
                  />
                )}
                {patientStep === 'P3' && (
                  <ReviewConfirm
                    key="p3"
                    form={patientForm}
                    isSubmitting={isSubmitting}
                    onBack={() => setPatientStep('P2')}
                    onEditStep={(step) => setPatientStep(step === 'P1' ? 'P1' : 'P2')}
                    onSubmit={handlePatientSubmit}
                  />
                )}
                {patientStep === 'P4' && checkinResult && (
                  <QueueConfirmation
                    key="p4"
                    result={checkinResult}
                    phone={patientForm.phone}
                    onReset={resetPatientFlow}
                  />
                )}
              </AnimatePresence>
            </div>

            <footer className="px-5 py-3.5 bg-slate-50 border-t border-surface-border text-center text-[10px] text-text-tertiary">
              MediQueue AI Triage &bull; Powered by AWS Amazon Bedrock
            </footer>
          </div>
        </main>
      )}

      {/* STAFF PORTAL */}
      {activePortal === 'staff' && (
        <main className="flex-1 flex flex-col p-4 max-w-7xl w-full mx-auto">
          <StaffDashboard />
        </main>
      )}
    </div>
  );
}

