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
  const [stats, setStats] = useState<Stats>({ inQueue: 0, avgWait: 0, redFlags: 0, seenToday: 0 });
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
      if (activeFilter === 'red_flag') return p.isRedFlag && p.status !== 'completed';
      if (activeFilter === 'waiting') return p.status === 'waiting' || p.status === 'escalated';
      if (activeFilter === 'in_progress') return p.status === 'in_progress';
      if (activeFilter === 'completed') return p.status === 'completed';
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
        if (p.status === 'escalated') return 1000;
        const priority = p.confirmedPriority || p.aiSuggestedPriority;
        if (priority === 'urgent') return 3;
        if (priority === 'moderate') return 2;
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
    try {
      await updatePatientState(patientId, { confirmedPriority: null });
      await refresh();
    } catch {
      alert('Could not confirm priority.');
    }
  }, [refresh]);

  const overridePriority = useCallback(async (patientId: string, priority: PatientPriority, reason: string) => {
    try {
      await updatePatientState(patientId, {
        confirmedPriority: priority,
        overrideReason: reason || 'Manual adjustment by clinical staff.',
      });
      await refresh();
    } catch {
      alert('Could not override priority.');
    }
  }, [refresh]);

  const updateStatus = useCallback(async (patientId: string, status: PatientStatus) => {
    try {
      await updatePatientState(patientId, { status });
      await refresh();
    } catch {
      alert('Could not update patient state.');
    }
  }, [refresh]);

  const escalatePatient = useCallback(async (patientId: string) => {
    try {
      await updatePatientState(patientId, { status: 'escalated' });
      await refresh();
    } catch {
      alert('Could not escalate patient.');
    }
  }, [refresh]);

  const saveNotes = useCallback(async (patientId: string, notes: string) => {
    try {
      await updatePatientState(patientId, { notes });
      alert('Clinical note preserved successfully.');
    } catch {
      alert('Could not save clinical note.');
    }
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
