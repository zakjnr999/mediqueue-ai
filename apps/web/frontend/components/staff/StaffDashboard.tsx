'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useQueue } from '@/hooks/use-queue';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLogin } from '@/components/staff/StaffLogin';
import { DashboardHeader } from '@/components/staff/DashboardHeader';
import { MetricCards } from '@/components/staff/MetricCards';
import { QueueStatusBar } from '@/components/staff/QueueStatusBar';
import { QueueAnalytics } from '@/components/staff/QueueAnalytics';
import { PatientCard } from '@/components/staff/PatientCard';
import { EmptyState } from '@/components/staff/EmptyState';
import { PriorityModal } from '@/components/staff/PriorityModal';
import type { Patient, PatientPriority } from '@/types/patient';
import { POLLING_INTERVALS } from '@/constants';

/**
 * StaffDashboard — self-contained staff portal for queue monitoring
 * and patient status management.
 *
 * Manages:
 * - Authentication (login/logout via Cognito)
 * - Queue data auto-refresh every 20s
 * - Patient filtering, sorting, expanded cards
 * - Priority override modal
 * - Escalation routing to the correct backend endpoint
 */
export function StaffDashboard() {
  // ── Queue state ──────────────────────────────────────────────
  const {
    patients,
    stats,
    isLoading: isLoadingQueue,
    error: queueError,
    activeFilter,
    expandedPatientId,
    staffNotesInput,
    filteredPatients,
    setActiveFilter,
    setExpandedPatientId,
    setStaffNotesInput,
    refresh: refreshQueue,
    confirmPriority,
    overridePriority,
    updateStatus,
    escalatePatient,
    saveNotes,
  } = useQueue();

  // ── Auth state ───────────────────────────────────────────────
  const {
    isLoggedIn: isStaffLoggedIn,
    email: staffEmail,
    password,
    loginError: staffLoginError,
    isLoggingIn,
    setEmail,
    setPassword,
    handleLogin: handleStaffLogin,
    handleLogout,
  } = useStaffAuth(refreshQueue);

  // ── Auto-refresh queue every 20s when logged in ──────────────
  useEffect(() => {
    if (!isStaffLoggedIn) return;
    const interval = setInterval(refreshQueue, POLLING_INTERVALS.queueData);
    return () => clearInterval(interval);
  }, [isStaffLoggedIn, refreshQueue]);

  // ── Live clock for elapsed-time calculations ─────────────────
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 15_000);
    return () => clearInterval(interval);
  }, []);

  // ── Override priority modal state ────────────────────────────
  const [overridePatient, setOverridePatient] = useState<Patient | null>(null);
  const [overridePriorityValue, setOverridePriorityValue] = useState<PatientPriority>('LOW');
  const [overrideReason, setOverrideReason] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const openOverrideModal = useCallback((p: Patient) => {
    setOverridePatient(p);
    setOverridePriorityValue(p.confirmedPriority || p.aiSuggestedPriority);
    setOverrideReason(p.overrideReason || '');
  }, []);

  const handleSaveOverride = useCallback(async () => {
    if (!overridePatient) return;
    setIsSavingOverride(true);
    await overridePriority(overridePatient.id, overridePriorityValue, overrideReason);
    setIsSavingOverride(false);
    setOverridePatient(null);
  }, [overridePatient, overridePriorityValue, overrideReason, overridePriority]);

  // ── Render ───────────────────────────────────────────────────

  // Not logged in → show login form
  if (!isStaffLoggedIn) {
    return (
      <StaffLogin
        email={staffEmail}
        password={password}
        loginError={staffLoginError}
        isLoggingIn={isLoggingIn}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleStaffLogin}
      />
    );
  }

  // Logged in → show dashboard
  return (
    <>
      <div className="space-y-4 flex flex-col flex-1">
        <DashboardHeader
          isLoading={isLoadingQueue}
          onRefresh={refreshQueue}
          onLogout={handleLogout}
          userEmail={staffEmail}
        />

        {/* Connection error banner */}
        {queueError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-800 flex items-center gap-2 shadow-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span className="flex-1">{queueError}</span>
            <button
              onClick={refreshQueue}
              className="text-xs font-bold text-red-700 hover:underline shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        <MetricCards stats={stats} />

        <QueueAnalytics patients={patients} stats={stats} />

        <QueueStatusBar
          patients={patients}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />

        <div className="space-y-3 flex-1 overflow-y-auto pb-4">
          {filteredPatients.length === 0 ? (
            <EmptyState onRefresh={refreshQueue} />
          ) : (
            filteredPatients.map((patient) => (
              <PatientCard
                key={patient.id}
                patient={patient}
                isExpanded={expandedPatientId === patient.id}
                currentTime={currentTime}
                staffNotesInput={staffNotesInput}
                onToggleExpand={() =>
                  setExpandedPatientId(
                    expandedPatientId === patient.id ? null : patient.id,
                  )
                }
                onConfirmPriority={() => confirmPriority(patient.id)}
                onOpenOverride={() => openOverrideModal(patient)}
                onUpdateStatus={(status) => updateStatus(patient.id, status)}
                onEscalate={() => escalatePatient(patient.id)}
                onSaveNotes={(notes) => saveNotes(patient.id, notes)}
                onStaffNotesChange={setStaffNotesInput}
              />
            ))
          )}
        </div>
      </div>

      <PriorityModal
        patient={overridePatient}
        overridePriority={overridePriorityValue}
        overrideReason={overrideReason}
        isSaving={isSavingOverride}
        onPriorityChange={setOverridePriorityValue}
        onReasonChange={setOverrideReason}
        onSave={handleSaveOverride}
        onClose={() => setOverridePatient(null)}
      />
    </>
  );
}
