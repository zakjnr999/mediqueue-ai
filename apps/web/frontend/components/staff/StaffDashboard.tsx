'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
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

  // Load queue immediately when a staff session is restored after refresh.
  useEffect(() => {
    if (!isStaffLoggedIn) return;
    void refreshQueue();
  }, [isStaffLoggedIn, refreshQueue]);

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

  // ── Search and pagination ────────────────────────────────────
  const [queueSearch, setQueueSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const searchedPatients = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    if (!query) return filteredPatients;

    return filteredPatients.filter((patient) => {
      const searchable = [
        patient.name,
        patient.queueNumber,
        patient.phone,
        patient.sex,
        String(patient.age),
        patient.aiSuggestedPriority,
        patient.confirmedPriority || '',
        patient.status,
      ].join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }, [filteredPatients, queueSearch]);

  const totalPages = Math.max(1, Math.ceil(searchedPatients.length / pageSize));
  const visiblePatients = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return searchedPatients.slice(start, start + pageSize);
  }, [searchedPatients, currentPage, pageSize]);
  const firstVisible = searchedPatients.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const lastVisible = Math.min(currentPage * pageSize, searchedPatients.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [queueSearch, activeFilter, pageSize]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 flex items-center gap-2 shadow-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span className="flex-1">{queueError}</span>
            <button
              onClick={refreshQueue}
              className="text-sm font-bold text-red-700 hover:underline shrink-0"
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

        <div className="bg-white border border-surface-border rounded-lg p-3 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
              <input
                value={queueSearch}
                onChange={(event) => setQueueSearch(event.target.value)}
                placeholder="Search name or queue number"
                className="w-full h-11 rounded-lg border border-surface-border bg-white pl-10 pr-10 text-base text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
              />
              {queueSearch && (
                <button
                  onClick={() => setQueueSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-md text-text-tertiary hover:bg-slate-100 hover:text-text-primary inline-flex items-center justify-center"
                  aria-label="Clear queue search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 justify-between md:justify-end">
              <label className="text-sm font-semibold text-text-secondary" htmlFor="queue-page-size">
                Rows
              </label>
              <select
                id="queue-page-size"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
                className="h-11 rounded-lg border border-surface-border bg-white px-3 text-sm font-semibold text-text-primary focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-secondary">
            <span>
              Showing <strong className="text-text-primary">{firstVisible}-{lastVisible}</strong> of{' '}
              <strong className="text-text-primary">{searchedPatients.length}</strong>
              {filteredPatients.length !== searchedPatients.length ? ` matched from ${filteredPatients.length}` : ''}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                className="h-9 w-9 rounded-lg border border-surface-border inline-flex items-center justify-center text-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Previous queue page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="min-w-[82px] text-center font-semibold text-text-primary">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                className="h-9 w-9 rounded-lg border border-surface-border inline-flex items-center justify-center text-text-secondary hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Next queue page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto pb-4">
          {searchedPatients.length === 0 ? (
            <EmptyState onRefresh={refreshQueue} />
          ) : (
            visiblePatients.map((patient) => (
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
