'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PatientFormState, SelfAssessedUrgency, CheckinResult } from '@/types/patient';
import { submitCheckin } from '@/services/checkin-service';
import { fetchPatientById, fetchPatientByQueueNumber } from '@/services/patient-service';

export type PatientStep = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

const INITIAL_FORM: PatientFormState = {
  name: '',
  phone: '',
  age: '',
  sex: '',
  symptoms: [],
  freeText: '',
  selfUrgency: 'minor',
};

interface UseCheckinReturn {
  step: PatientStep;
  setStep: (step: PatientStep) => void;
  form: PatientFormState;
  errors: Record<string, string>;
  isSubmitting: boolean;
  result: CheckinResult | null;
  statusCheckQueueNum: string;
  statusCheckError: string;
  updateForm: (patch: Partial<PatientFormState>) => void;
  setStatusCheckQueueNum: (val: string) => void;
  handleP1Continue: () => void;
  handlePatientSubmit: () => Promise<void>;
  handleStatusCheck: (e: React.FormEvent) => Promise<void>;
  resetPatientFlow: () => void;
}

export function useCheckin(): UseCheckinReturn {
  const [step, setStep] = useState<PatientStep>('P0');
  const [form, setForm] = useState<PatientFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CheckinResult | null>(null);
  const [statusCheckQueueNum, setStatusCheckQueueNum] = useState('');
  const [statusCheckError, setStatusCheckError] = useState('');

  const updateForm = useCallback((patch: Partial<PatientFormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  // Validate P1 personal info
  const validateP1 = useCallback((): boolean => {
    const tempErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      tempErrors.name = 'Please enter your full name';
    } else if (form.name.length < 2) {
      tempErrors.name = 'Name must be at least 2 characters';
    }

    const phoneClean = form.phone.replace(/\D/g, '');
    if (!form.phone.trim()) {
      tempErrors.phone = 'Please enter your phone number';
    } else if (phoneClean.length < 9 || phoneClean.length > 15) {
      tempErrors.phone = 'Please enter a valid phone number (9-15 digits)';
    }

    const ageNum = parseInt(form.age, 10);
    if (!form.age) {
      tempErrors.age = 'Please enter your age';
    } else if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      tempErrors.age = 'Please enter an age between 1 and 120';
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  }, [form]);

  const handleP1Continue = useCallback(() => {
    if (validateP1()) {
      setStep('P2');
    }
  }, [validateP1]);

  // Submit check-in
  const handlePatientSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const response = await submitCheckin({
        name: form.name,
        phone: form.phone,
        age: form.age,
        sex: form.sex || 'Prefer not to say',
        symptoms: form.symptoms,
        freeText: form.freeText,
        selfUrgency: form.selfUrgency,
      });

      if (response.success) {
        setResult({
          patientId: response.data.patientId,
          queueNumber: response.data.queueNumber,
          estimatedWait: response.data.estimatedWait,
          status: response.data.status,
          position: response.data.position,
          name: response.data.name,
        });
        setStep('P4');
      } else {
        alert('Check-in failed. Please try again.');
      }
    } catch {
      alert('Network failure during check-in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [form]);

  // Status check lookup
  const handleStatusCheck = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusCheckError('');
    if (!statusCheckQueueNum.trim()) return;

    try {
      const data = await fetchPatientByQueueNumber(statusCheckQueueNum.trim());
      if (data?.success) {
        setResult({
          patientId: data.data.patientId,
          queueNumber: data.data.queueNumber,
          estimatedWait: data.data.estimatedWait ?? 0,
          status: data.data.status,
          position: data.data.position,
          name: data.data.name,
        });
        setStep('P4');
      } else {
        setStatusCheckError('No active patient found with this queue number.');
      }
    } catch {
      setStatusCheckError('Failed to query status. Please verify connection.');
    }
  }, [statusCheckQueueNum]);

  // Poll patient status on P4
  useEffect(() => {
    if (!result?.patientId || step !== 'P4') return;

    const interval = setInterval(async () => {
      try {
        const data = await fetchPatientById(result.patientId);
        if (data?.success) {
          setResult(prev => prev ? { ...prev, status: data.data.status, position: data.data.position } : prev);
        }
      } catch {
        // Silently retry on next poll
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [result?.patientId, step]);

  const resetPatientFlow = useCallback(() => {
    setForm(INITIAL_FORM);
    setResult(null);
    setErrors({});
    setStatusCheckQueueNum('');
    setStatusCheckError('');
    setStep('P0');
  }, []);

  return {
    step,
    setStep,
    form,
    errors,
    isSubmitting,
    result,
    statusCheckQueueNum,
    statusCheckError,
    updateForm,
    setStatusCheckQueueNum,
    handleP1Continue,
    handlePatientSubmit,
    handleStatusCheck,
    resetPatientFlow,
  };
}
