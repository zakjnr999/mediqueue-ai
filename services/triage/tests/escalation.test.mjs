import { test } from 'node:test';
import assert from 'node:assert';
import { validateEscalationRequest } from '../src/validation/validate-escalation-request.mjs';
import { escalatePatientService } from '../src/services/escalate-patient-service.mjs';
import { handler } from '../src/handlers/escalate-patient.mjs';
import { ApiError } from '../src/errors/api-error.mjs';

const validUUID = '550e8400-e29b-41d4-a716-446655440000';

test('Escalation - Input Validation Tests', async (t) => {
  await t.test('accepts valid reviewerDisplayName', () => {
    const result = validateEscalationRequest({ reviewerDisplayName: 'Nurse Rhoda' });
    assert.equal(result.reviewerDisplayName, 'Nurse Rhoda');
  });

  await t.test('rejects missing reviewerDisplayName', () => {
    assert.throws(() => validateEscalationRequest({}), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400;
    });
  });

  await t.test('rejects empty or whitespace-only reviewerDisplayName', () => {
    assert.throws(() => validateEscalationRequest({ reviewerDisplayName: '   ' }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR';
    });
  });

  await t.test('rejects non-string values', () => {
    assert.throws(() => validateEscalationRequest({ reviewerDisplayName: 123 }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR';
    });
  });

  await t.test('rejects unexpected properties', () => {
    assert.throws(() => validateEscalationRequest({ reviewerDisplayName: 'Rhoda', extra: 'foo' }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR';
    });
  });

  await t.test('rejects reviewerDisplayName exceeding 100 characters', () => {
    const longName = 'a'.repeat(101);
    assert.throws(() => validateEscalationRequest({ reviewerDisplayName: longName }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR';
    });
  });
});

test('Escalation - Service Operations Tests', async (t) => {
  const fixedNow = () => new Date('2026-06-24T12:00:00.000Z');

  await t.test('successfully escalates waiting patient', async () => {
    let getCalled = false;
    let escalateCalled = false;

    const mockPatient = {
      patientId: validUUID,
      queueNumber: 'MQ-12',
      entityType: 'PATIENT_CHECKIN',
      status: 'WAITING',
      updatedAt: '2026-06-24T10:00:00.000Z'
    };

    const deps = {
      getPatientDetailsFn: async (id) => {
        getCalled = true;
        assert.equal(id, validUUID);
        return mockPatient;
      },
      escalatePatientFn: async (id, params) => {
        escalateCalled = true;
        assert.equal(id, validUUID);
        assert.equal(params.reviewerDisplayName, 'Nurse Rhoda');
        assert.equal(params.expectedUpdatedAt, '2026-06-24T10:00:00.000Z');
        assert.equal(params.reviewedAt, '2026-06-24T12:00:00.000Z');
        return {
          ...mockPatient,
          isEscalated: true,
          escalatedBy: 'Nurse Rhoda',
          staffDecision: {
            confirmedPriority: 'HIGH',
            reviewedAt: params.reviewedAt,
            reviewerDisplayName: 'Nurse Rhoda'
          },
          updatedAt: params.updatedAt
        };
      },
      nowFn: fixedNow
    };

    const result = await escalatePatientService(validUUID, { reviewerDisplayName: 'Nurse Rhoda' }, deps);

    assert.ok(getCalled);
    assert.ok(escalateCalled);
    assert.equal(result.isEscalated, true);
    assert.equal(result.escalatedBy, 'Nurse Rhoda');
    assert.equal(result.status, 'WAITING');
    assert.equal(result.staffDecision.confirmedPriority, 'HIGH');
    assert.equal(result.staffDecision.reviewerDisplayName, 'Nurse Rhoda');
    assert.equal(result.updatedAt, '2026-06-24T12:00:00.000Z');
  });

  await t.test('fails to escalate when status is not WAITING', async () => {
    const mockPatient = {
      patientId: validUUID,
      entityType: 'PATIENT_CHECKIN',
      status: 'IN_PROGRESS',
      updatedAt: '2026-06-24T10:00:00.000Z'
    };

    const deps = {
      getPatientDetailsFn: async () => mockPatient,
      escalatePatientFn: async () => {
        throw new Error('Should not be called');
      },
      nowFn: fixedNow
    };

    await assert.rejects(
      escalatePatientService(validUUID, { reviewerDisplayName: 'Nurse Rhoda' }, deps),
      (err) => {
        return err instanceof ApiError && err.code === 'INVALID_STATUS_TRANSITION' && err.statusCode === 409;
      }
    );
  });

  await t.test('handles update conflict database exceptions', async () => {
    const mockPatient = {
      patientId: validUUID,
      entityType: 'PATIENT_CHECKIN',
      status: 'WAITING',
      updatedAt: '2026-06-24T10:00:00.000Z'
    };

    const deps = {
      getPatientDetailsFn: async () => mockPatient,
      escalatePatientFn: async () => {
        throw new ApiError('UPDATE_CONFLICT', 409, 'Conflict detected');
      },
      nowFn: fixedNow
    };

    await assert.rejects(
      escalatePatientService(validUUID, { reviewerDisplayName: 'Nurse Rhoda' }, deps),
      (err) => {
        return err instanceof ApiError && err.code === 'UPDATE_CONFLICT' && err.statusCode === 409;
      }
    );
  });
});

test('Escalation - Handler Behaviour', async (t) => {
  const envBackup = { ...process.env };

  t.afterEach(() => {
    process.env = { ...envBackup };
  });

  await t.test('returns 200 on success', async () => {
    process.env.PATIENTS_TABLE_NAME = 'TestTable';

    const mockDeps = {
      getPatientDetailsFn: async () => ({
        patientId: validUUID,
        entityType: 'PATIENT_CHECKIN',
        status: 'WAITING',
        updatedAt: '2026-06-24T10:00:00.000Z'
      }),
      escalatePatientFn: async (id, params) => ({
        patientId: id,
        queueNumber: 'MQ-123',
        isEscalated: true,
        escalatedBy: params.reviewerDisplayName,
        staffDecision: {
          confirmedPriority: 'HIGH',
          reviewedAt: params.reviewedAt,
          reviewerDisplayName: params.reviewerDisplayName
        },
        status: 'WAITING',
        updatedAt: params.updatedAt
      })
    };

    const event = {
      pathParameters: { patientId: validUUID },
      body: JSON.stringify({ reviewerDisplayName: 'Nurse Rhoda' })
    };

    const res = await handler(event, mockDeps);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.isEscalated, true);
    assert.equal(body.data.escalatedBy, 'Nurse Rhoda');
    assert.equal(body.data.staffDecision.confirmedPriority, 'HIGH');
  });

  await t.test('returns 500 when table configuration is missing', async () => {
    delete process.env.PATIENTS_TABLE_NAME;
    const event = {
      pathParameters: { patientId: validUUID },
      body: JSON.stringify({ reviewerDisplayName: 'Nurse Rhoda' })
    };

    const res = await handler(event);
    assert.equal(res.statusCode, 500);

    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFIGURATION_ERROR');
  });

  await t.test('returns 500 and prevents data leakage on unhandled errors', async () => {
    process.env.PATIENTS_TABLE_NAME = 'TestTable';

    const mockDeps = {
      getPatientDetailsFn: async () => {
        throw new Error('Database password leaked: secret123');
      }
    };

    const event = {
      pathParameters: { patientId: validUUID },
      body: JSON.stringify({ reviewerDisplayName: 'Nurse Rhoda' })
    };

    const res = await handler(event, mockDeps);
    assert.equal(res.statusCode, 500);

    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.ok(!res.body.includes('secret123'));
  });
});
