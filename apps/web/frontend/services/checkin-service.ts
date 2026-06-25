import { apiPost } from './api-client';

export interface CheckinSubmitResponse {
  success: boolean;
  data: {
    patientId: string;
    queueNumber: string;
    estimatedWait: number;
    status: string;
    position?: number;
    name?: string;
  };
}

export async function submitCheckin(body: {
  name: string;
  phone: string;
  age: string;
  sex: string;
  symptoms: string[];
  freeText: string;
  selfUrgency: string;
}): Promise<CheckinSubmitResponse> {
  return apiPost<CheckinSubmitResponse>('/checkin', body);
}
