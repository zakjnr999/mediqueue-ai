import { apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import type { PatientDetailsResponse } from '@/types/api';
import type { Patient, PatientStatus, PatientPriority } from '@/types/patient';

/**
 * Fetch full patient details by their UUID.
 * Maps the backend response to the frontend Patient type.
 */
export async function fetchPatientById(id: string): Promise<{
  success: boolean;
  data?: Patient;
}> {
  try {
    const response = await apiGet<PatientDetailsResponse>(
      ENDPOINTS.patients.details(id),
    );

    if (!response.success) {
      return { success: false };
    }

    const { data } = response;
    const ai = data.aiAssessment;
    const sd = data.staffDecision;

    return {
      success: true,
      data: {
        id: data.patientId,
        queueNumber: data.queueNumber,
        queueDate: '', // not returned by patient details
        name: data.fullName,
        phone: data.phoneNumber || '',
        age: data.age,
        sex: data.sex || '',
        symptoms: data.symptoms,
        freeText: data.additionalDetails || '',
        selfUrgency: (data.selfAssessedUrgency || 'Minor') as import('@/types/patient').SelfAssessedUrgency,
        aiSuggestedPriority: ai?.suggestedPriority as import('@/types/patient').PatientPriority || 'MEDIUM',
        aiSummary: ai?.summary || '',
        isRedFlag: (ai?.redFlags?.length ?? 0) > 0,
        confirmedPriority: sd?.confirmedPriority as import('@/types/patient').PatientPriority | null ?? null,
        overrideReason: sd?.overrideReason || undefined,
        notes: undefined,
        status: data.status as PatientStatus,
        createdAt: data.createdAt,
        attendedAt: data.status === 'IN_PROGRESS' ? data.updatedAt : undefined,
        completedAt: data.status === 'COMPLETED' ? data.updatedAt : undefined,
        escalatedAt: data.isEscalated ? data.updatedAt : undefined,
      },
    };
  } catch {
    return { success: false };
  }
}

/**
 * Look up a patient by their queue number.
 * This iterates today's queue list to find the matching patient,
 * then fetches full details via the patient details endpoint.
 * Falls back gracefully if the patient isn't found.
 */
export async function fetchPatientByQueueNumber(
  queueNumber: string,
): Promise<{ success: boolean; data?: Patient }> {
  try {
    const response = await apiGet<import('@/types/api').QueueListResponse>(
      ENDPOINTS.queue.list,
      { timeout: 10_000 },
    );

    if (!response.success || !response.data.patients.length) {
      return { success: false };
    }

    const match = response.data.patients.find(
      (p) => p.queueNumber === queueNumber,
    );

    if (!match) {
      return { success: false };
    }

    // Fetch full details for the matched patient
    return fetchPatientById(match.patientId);
  } catch {
    return { success: false };
  }
}

/**
 * Escalate a patient using the dedicated escalate endpoint.
 * This is separate from status updates because the backend has
 * a distinct POST /patients/{patientId}/escalate endpoint with
 * its own validation and business logic.
 */
export async function escalatePatientById(
  id: string,
): Promise<{ success: boolean }> {
  try {
    await apiPost(ENDPOINTS.patients.escalate(id), {});
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Update patient state — delegates to the appropriate endpoint
 * based on the update keys provided.
 *
 * - 'status' → PATCH /patients/{id}/status
 * - 'confirmedPriority' → PATCH /patients/{id}/priority
 * - Notes are not currently supported by a dedicated endpoint.
 */
export async function updatePatientState(
  id: string,
  updates: Record<string, unknown>,
  /** The current patient record, needed to resolve the AI-suggested priority for confirm actions. */
  currentPatient?: Patient,
): Promise<{ success: boolean }> {
  try {
    if ('status' in updates) {
      await apiPatch(ENDPOINTS.patients.status(id), {
        status: updates.status,
      });
    } else if ('confirmedPriority' in updates || 'overrideReason' in updates) {
      // Backend expects `confirmedPriority` (HIGH/MEDIUM/LOW) — never null.
      // When confirming (null from UI), use the patient's AI-suggested priority.
      let confirmedPriority = updates.confirmedPriority as string | null;
      if (!confirmedPriority && currentPatient) {
        confirmedPriority = currentPatient.aiSuggestedPriority;
      }
      await apiPatch(ENDPOINTS.patients.priority(id), {
        confirmedPriority,
        overrideReason: updates.overrideReason ?? null,
      });
    }
    return { success: true };
  } catch {
    return { success: false };
  }
}
