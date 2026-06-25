import { apiPost } from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { CreateCheckinResponse } from '@/types/api';
import type { CheckinResult } from '@/types/patient';

/** Payload sent to the backend POST /check-ins endpoint. */
interface BackendCheckinPayload {
  fullName: string;
  age: number;
  phoneNumber: string;
  symptoms: string[];
  additionalDetails: string;
  sex: string;
  selfAssessedUrgency: string;
}

/**
 * Submit a patient self-check-in to the backend.
 * Maps frontend form fields → backend contract, then maps the
 * backend response back to a frontend-friendly CheckinResult.
 */
export async function submitCheckin(form: {
  name: string;
  phone: string;
  age: string;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: string;
}): Promise<{ success: boolean; data: CheckinResult }> {
  const payload: BackendCheckinPayload = {
    fullName: form.name,
    age: parseInt(form.age, 10),
    phoneNumber: form.phone,
    symptoms: form.symptoms,
    additionalDetails: form.freeText,
    sex: form.sex || 'Prefer not to say',
    selfAssessedUrgency: form.selfUrgency,
  };

  const response = await apiPost<CreateCheckinResponse>(
    ENDPOINTS.checkins.create,
    payload,
  );

  if (!response.success) {
    return { success: false, data: null as unknown as CheckinResult };
  }

  const { data } = response;

  return {
    success: true,
    data: {
      patientId: data.patientId,
      queueNumber: data.queueNumber,
      estimatedWaitMinutes: data.estimatedWaitTimeMinutes,
      queuePosition: data.peopleAhead,
      status: data.status as CheckinResult['status'],
    },
  };
}
