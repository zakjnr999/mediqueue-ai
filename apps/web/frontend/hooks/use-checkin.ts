'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PatientFormState, CheckinResult } from '@/types/patient';
import { submitCheckin } from '@/services/checkin-service';
import { fetchPatientById, fetchPatientByQueueNumber } from '@/services/patient-service';
import { ApiHttpError, ApiNetworkError } from '@/lib/api/errors';

export type PatientStep = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

const INITIAL_FORM: PatientFormState = {
  name: '',
  phone: '',
  age: '',
  sex: '',
  symptoms: [],
  freeText: '',
  selfUrgency: 'Minor',
};

const GHANA_PHONE_REGEX = /^(?:\+233|233|0)(?:20|23|24|25|26|27|28|29|50|53|54|55|56|57|58|59)\d{7}$/;

function cleanPhoneInput(value: string): string {
  return value
    .replace(/[^\d+\s()-]/g, '')
    .replace(/(?!^)\+/g, '')
    .slice(0, 20);
}

function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

function hasRepeatedDigitsOnly(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 && /^(\d)\1+$/.test(digits);
}

function cleanAgeInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 3);
}

interface UseCheckinReturn {
  step: PatientStep;
  setStep: (step: PatientStep) => void;
  form: PatientFormState;
  errors: Record<string, string>;
  isSubmitting: boolean;
  result: CheckinResult | null;
  statusCheckQueueNum: string;
  statusCheckError: string;
  submitError: string;
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
  const [submitError, setSubmitError] = useState('');

  const updateForm = useCallback((patch: Partial<PatientFormState>) => {
    const nextPatch = { ...patch };
    if (typeof nextPatch.phone === 'string') {
      nextPatch.phone = cleanPhoneInput(nextPatch.phone);
    }
    if (typeof nextPatch.age === 'string') {
      nextPatch.age = cleanAgeInput(nextPatch.age);
    }
    setForm(prev => ({ ...prev, ...nextPatch }));
    setSubmitError('');
  }, []);

  // Validate P1 personal info
  const validateP1 = useCallback((): boolean => {
    const tempErrors: Record<string, string> = {};
    if (!form.name.trim()) {
      tempErrors.name = 'Please enter your full name';
    } else if (form.name.trim().length < 2) {
      tempErrors.name = 'Name must be at least 2 characters';
    } else if (form.name.trim().length > 100) {
      tempErrors.name = 'Name must be under 100 characters';
    } else if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' -]+$/.test(form.name.trim())) {
      tempErrors.name = 'Name can only contain letters, spaces, hyphens, and apostrophes';
    }

    const phoneClean = normalizePhone(form.phone);
    if (!form.phone.trim()) {
      tempErrors.phone = 'Please enter your phone number';
    } else if (hasRepeatedDigitsOnly(form.phone) || !GHANA_PHONE_REGEX.test(phoneClean)) {
      tempErrors.phone = 'Enter a valid Ghana mobile number, e.g. 024 123 4567 or +233 24 123 4567';
    }

    const ageNum = Number(form.age);
    if (!form.age) {
      tempErrors.age = 'Please enter your age';
    } else if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      tempErrors.age = 'Please enter an age between 1 and 120';
    }

    if (!form.sex) {
      tempErrors.sex = 'Please select sex';
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
    setSubmitError('');
    if (form.symptoms.length === 0 && !form.freeText.trim()) {
      setSubmitError('Please select at least one symptom or describe what brings you in today.');
      setStep('P2');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await submitCheckin({
        name: form.name.trim(),
        phone: normalizePhone(form.phone),
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
          estimatedWaitMinutes: response.data.estimatedWaitMinutes,
          status: response.data.status as import('@/types/patient').PatientStatus,
          queuePosition: response.data.queuePosition,
        });
        setStep('P4');
      } else {
        setSubmitError('Check-in failed. Please try again.');
      }
    } catch (err) {
      if (err instanceof ApiHttpError) {
        setSubmitError(err.getUserMessage());
      } else if (err instanceof ApiNetworkError) {
        setSubmitError('We could not reach the check-in service. Please check the connection and try again.');
      } else {
        setSubmitError('Check-in failed. Please try again.');
      }
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
      const result = await fetchPatientByQueueNumber(statusCheckQueueNum.trim());
      if (result?.success && result.data) {
        const patient = result.data;
        setResult({
          patientId: patient.id,
          queueNumber: patient.queueNumber,
          estimatedWaitMinutes: 0,
          status: patient.status,
          queuePosition: 0,
        });
        setStep('P4');
      } else {
        setStatusCheckError('Status lookup is currently available at the staff desk.');
      }
    } catch {
      setStatusCheckError('Status lookup is currently available at the staff desk.');
    }
  }, [statusCheckQueueNum]);

  // Poll patient status on P4
  useEffect(() => {
    if (!result?.patientId || step !== 'P4') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetchPatientById(result.patientId);
        if (res?.success && res.data) {
          const { status } = res.data;
          setResult(prev =>
            prev ? { ...prev, status } : prev,
          );
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
    setSubmitError('');
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
    submitError,
    updateForm,
    setStatusCheckQueueNum,
    handleP1Continue,
    handlePatientSubmit,
    handleStatusCheck,
    resetPatientFlow,
  };
}
