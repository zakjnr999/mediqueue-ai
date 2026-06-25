'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Patient, PatientPriority, PatientStatus } from '@/types/patient';
import type { Stats, QueueFilter, SortOption } from '@/types/queue';
import { fetchQueue } from '@/services/queue-service';
import { updatePatientState } from '@/services/patient-service';

interface UseQueueReturn {
  patients: Patient[];
  stats: Stats;
  isLoading: boolean;
  error: string;
  activeFilter: QueueFilter;
  sortBy: SortOption;
  expandedPatientId: string | null;
  staffNotesInput: string;
  filteredPatients: Patient[];
  setActiveFilter: (f: QueueFilter) => void;
  setSortBy: (s: SortOption) => void;
  setExpandedPatientId: (id: string | null) => void;
  setStaffNotesInput: (val: string) => void;
  refresh: () => Promise<void>;
  confirmPriority: (patientId: string) => Promise<void>;
  overridePriority: (patientId: string, priority: PatientPriority, reason: string) => Promise<void>;
  updateStatus: (patientId: string, status: PatientStatus) => Promise<void>;
  saveNotes: (patientId: string, notes: string) => Promise<void>;
  escalatePatient: (patientId: string) => Promise<void>;
}

export function useQueue(): UseQueueReturn {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [stats, setStats] = useState<Stats>({ patientsInQueue: 0, averageWaitMinutes: 0, redFlagCount: 0, seenTodayCount: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeFilter, setActiveFilter] = useState<QueueFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [expandedPatientId, setExpandedPatientId] = useState<string | null>(null);
  const [staffNotesInput, setStaffNotesInput] = useState('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchQueue();
      setPatients(data.patients);
      setStats(data.stats);
      if (!data.patients.length && !data.stats.patientsInQueue) {
        // Queue may be empty — not necessarily an error
      }
    } catch {
      setError('Connection failed. Please check your backend connection.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter engine
  const filteredPatients = useMemo(() => {
    return patients.filter(p => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'red_flag') return p.isRedFlag && p.status !== 'COMPLETED';
      if (activeFilter === 'WAITING') return p.status === 'WAITING' || p.status === 'ESCALATED';
      if (activeFilter === 'IN_PROGRESS') return p.status === 'IN_PROGRESS';
      if (activeFilter === 'COMPLETED') return p.status === 'COMPLETED';
      return true;
    }).sort((a, b) => {
      if (sortBy === 'wait_time') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'arrival') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // Sort by priority: escalated -> urgent -> moderate -> minor
      const getScore = (p: Patient) => {
        if (p.status === 'ESCALATED') return 1000;
        const priority = p.confirmedPriority || p.aiSuggestedPriority;
        if (priority === 'HIGH') return 3;
        if (priority === 'MEDIUM') return 2;
        return 1;
      };
      const scoreA = getScore(a);
      const scoreB = getScore(b);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [patients, activeFilter, sortBy]);

  // Staff actions
  const confirmPriority = useCallback(async (patientId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    const result = await updatePatientState(
      patientId,
      { confirmedPriority: null },
      patient,
    );
    if (!result.success) {
      alert('Could not confirm priority.');
      return;
    }
    await refresh();
  }, [refresh, patients]);

  const overridePriority = useCallback(async (patientId: string, priority: PatientPriority, reason: string) => {
    const result = await updatePatientState(patientId, {
      confirmedPriority: priority,
      overrideReason: reason || 'Manual adjustment by clinical staff.',
    });
    if (!result.success) {
      alert('Could not override priority.');
      return;
    }
    await refresh();
  }, [refresh]);

  const updateStatus = useCallback(async (patientId: string, status: PatientStatus) => {
    const result = await updatePatientState(patientId, { status });
    if (!result.success) {
      alert('Could not update patient state.');
      return;
    }
    await refresh();
  }, [refresh]);

  const escalatePatient = useCallback(async (patientId: string) => {
    const { escalatePatientById } = await import('@/services/patient-service');
    const result = await escalatePatientById(patientId);
    if (!result.success) {
      alert('Could not escalate patient.');
      return;
    }
    await refresh();
  }, [refresh]);

  const saveNotes = useCallback(async (_patientId: string, _notes: string) => {
    // Notes are stored locally for now — the backend does not yet
    // expose a dedicated notes endpoint.
    alert('Clinical notes are not yet persisted to the server.');
  }, []);

  return {
    patients,
    stats,
    isLoading,
    error,
    activeFilter,
    sortBy,
    expandedPatientId,
    staffNotesInput,
    filteredPatients,
    setActiveFilter,
    setSortBy,
    setExpandedPatientId,
    setStaffNotesInput,
    refresh,
    confirmPriority,
    overridePriority,
    updateStatus,
    saveNotes,
    escalatePatient,
  };
}
