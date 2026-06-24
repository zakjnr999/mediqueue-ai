import test from 'node:test';
import assert from 'node:assert';
import { validatePriorityUpdate } from '../src/validation/validate-priority-update.mjs';
import { validateStatusUpdate } from '../src/validation/validate-status-update.mjs';
import { updatePriorityService } from '../src/services/update-priority-service.mjs';
import { updateStatusService } from '../src/services/update-status-service.mjs';
import { createHandler as createUpdatePriorityHandler, handler as productionUpdatePriorityHandler } from '../src/handlers/update-priority.mjs';
import { createHandler as createUpdateStatusHandler, handler as productionUpdateStatusHandler } from '../src/handlers/update-status.mjs';
import { updatePatientPriority, updatePatientStatus } from '../src/repositories/patient-repository.mjs';
import { ApiError } from '../src/errors/api-error.mjs';

const validUUID = '550e8400-e29b-41d4-a716-446655440000';
const fixedNow = () => new Date('2026-06-23T14:30:00.000Z');

// Test data generator helper
function createValidPatient(overrides = {}) {
  return {
    id: `PATIENT#${validUUID}`,
    entityType: 'PATIENT_CHECKIN',
    patientId: validUUID,
    queueNumber: 'MQ-20260623-0001',
    aiAssessment: {
      summary: 'Patient reports weakness',
      redFlags: [],
      suggestedPriority: 'MEDIUM',
      reason: 'Staff review needed',
      requiresImmediateStaffReview: true
    },
    staffDecision: {
      confirmedPriority: null,
      reviewedBy: null,
      reviewedAt: null,
      overrideReason: null,
      reviewerDisplayName: null
    },
    status: 'WAITING',
    createdAt: '2026-06-23T14:30:00.000Z',
    updatedAt: '2026-06-23T14:30:00.000Z',
    fullName: 'Demo Patient',
    phoneNumber: '0200000000',
    symptoms: ['Weakness'],
    additionalDetails: 'Symptom start 2h ago',
    ...overrides
  };
}

test('Staff Actions - Input Validation Tests', async (t) => {
  await t.test('Priority - valid confirmation matching AI suggested priority', () => {
    const res = validatePriorityUpdate({ confirmedPriority: 'MEDIUM' }, 'MEDIUM');
    assert.equal(res.confirmedPriority, 'MEDIUM');
    assert.equal(res.overrideReason, null);
  });

  await t.test('Priority - valid override with a reason', () => {
    const res = validatePriorityUpdate(
      { confirmedPriority: 'HIGH', overrideReason: 'Patient feels dizzy' },
      'MEDIUM'
    );
    assert.equal(res.confirmedPriority, 'HIGH');
    assert.equal(res.overrideReason, 'Patient feels dizzy');
  });

  await t.test('Priority - missing confirmed priority throws validation error', () => {
    assert.throws(
      () => validatePriorityUpdate({ overrideReason: 'Reason' }, 'MEDIUM'),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400
    );
  });

  await t.test('Priority - invalid priority value throws validation error', () => {
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'CRITICAL' }, 'MEDIUM'),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Priority - unexpected request property is rejected', () => {
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'MEDIUM', extra: 'field' }, 'MEDIUM'),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Priority - override without a reason throws error', () => {
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'HIGH' }, 'MEDIUM'),
      (err) => err.code === 'PRIORITY_OVERRIDE_REASON_REQUIRED' && err.statusCode === 400
    );
  });

  await t.test('Priority - empty override reason throws error', () => {
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'HIGH', overrideReason: '   ' }, 'MEDIUM'),
      (err) => err.code === 'PRIORITY_OVERRIDE_REASON_REQUIRED'
    );
  });

  await t.test('Priority - override reason longer than 500 characters is rejected', () => {
    const longReason = 'a'.repeat(501);
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'HIGH', overrideReason: longReason }, 'MEDIUM'),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Priority - matching priority does not require a reason but normalizes empty/omitted to null', () => {
    const res = validatePriorityUpdate({ confirmedPriority: 'MEDIUM', overrideReason: '   ' }, 'MEDIUM');
    assert.equal(res.confirmedPriority, 'MEDIUM');
    assert.equal(res.overrideReason, null);
  });

  await t.test('Priority - validation does not mutate the request body', () => {
    const originalBody = { confirmedPriority: 'MEDIUM ', overrideReason: '  ' };
    const res = validatePriorityUpdate(originalBody, 'MEDIUM');
    assert.equal(res.confirmedPriority, 'MEDIUM');
    assert.equal(res.overrideReason, null);
    assert.equal(originalBody.confirmedPriority, 'MEDIUM ');
  });

  await t.test('Priority - reviewedBy is rejected from client input', () => {
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'MEDIUM', reviewedBy: 'Dr. Smith' }, 'MEDIUM'),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Priority - reviewerDisplayName is accepted and normalized', () => {
    const res = validatePriorityUpdate({ confirmedPriority: 'MEDIUM', reviewerDisplayName: '  Dr. Smith  ' }, 'MEDIUM');
    assert.equal(res.reviewerDisplayName, 'Dr. Smith');
  });

  await t.test('Priority - reviewerDisplayName is null when absent', () => {
    const res = validatePriorityUpdate({ confirmedPriority: 'MEDIUM' }, 'MEDIUM');
    assert.equal(res.reviewerDisplayName, null);
  });

  await t.test('Priority - reviewerDisplayName longer than 100 characters is rejected', () => {
    assert.throws(
      () => validatePriorityUpdate({ confirmedPriority: 'MEDIUM', reviewerDisplayName: 'a'.repeat(101) }, 'MEDIUM'),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Status - WAITING validation passes', () => {
    const res = validateStatusUpdate({ status: 'WAITING' });
    assert.equal(res.status, 'WAITING');
  });

  await t.test('Status - missing status parameter', () => {
    assert.throws(
      () => validateStatusUpdate({}),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Status - invalid status value', () => {
    assert.throws(
      () => validateStatusUpdate({ status: 'DISCHARGED' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('Status - unexpected properties rejected', () => {
    assert.throws(
      () => validateStatusUpdate({ status: 'IN_PROGRESS', reviewer: 'Bob' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });
});

test('Staff Actions - Service Operations Tests', async (t) => {
  await t.test('Priority - successful confirmation matching AI suggestion', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientPriorityFn: async (id, params) => {
        assert.equal(params.confirmedPriority, 'MEDIUM');
        assert.equal(params.overrideReason, null);
        assert.equal(params.reviewerDisplayName, null);
        assert.equal(params.expectedUpdatedAt, patient.updatedAt);
        assert.equal(params.reviewedAt, fixedNow().toISOString());
        return {
          ...patient,
          staffDecision: {
            confirmedPriority: 'MEDIUM',
            reviewedAt: params.reviewedAt,
            reviewedBy: null,
            overrideReason: null,
            reviewerDisplayName: null
          },
          updatedAt: params.updatedAt
        };
      },
      nowFn: fixedNow
    };

    const res = await updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM' }, deps);
    assert.equal(res.patientId, validUUID);
    assert.equal(res.aiSuggestedPriority, 'MEDIUM');
    assert.equal(res.staffDecision.confirmedPriority, 'MEDIUM');
    assert.equal(res.staffDecision.overrideReason, null);
    assert.equal(res.staffDecision.reviewerDisplayName, null);
    assert.equal(res.status, 'WAITING');
    assert.equal(res.updatedAt, fixedNow().toISOString());

    // Strict response checks - verify NO PII or internal keys leak
    const resKeys = Object.keys(res);
    assert.ok(!resKeys.includes('id'));
    assert.ok(!resKeys.includes('entityType'));
    assert.ok(!resKeys.includes('fullName'));
    assert.ok(!resKeys.includes('phoneNumber'));
  });

  await t.test('Priority - successful confirmation with reviewerDisplayName', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientPriorityFn: async (id, params) => {
        assert.equal(params.confirmedPriority, 'MEDIUM');
        assert.equal(params.reviewerDisplayName, 'Dr. Smith');
        return {
          ...patient,
          staffDecision: {
            confirmedPriority: 'MEDIUM',
            reviewedAt: params.reviewedAt,
            reviewedBy: null,
            overrideReason: null,
            reviewerDisplayName: 'Dr. Smith'
          },
          updatedAt: params.updatedAt
        };
      },
      nowFn: fixedNow
    };

    const res = await updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM', reviewerDisplayName: 'Dr. Smith' }, deps);
    assert.equal(res.staffDecision.reviewerDisplayName, 'Dr. Smith');
  });

  await t.test('Priority - missing patient returns PATIENT_NOT_FOUND', async () => {
    const deps = {
      getPatientDetailsFn: async () => null,
      updatePatientPriorityFn: async () => {}
    };
    await assert.rejects(
      () => updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM' }, deps),
      (err) => err instanceof ApiError && err.code === 'PATIENT_NOT_FOUND' && err.statusCode === 404
    );
  });

  await t.test('Priority - wrong entity type returns PATIENT_NOT_FOUND', async () => {
    const deps = {
      getPatientDetailsFn: async () => ({ id: `PATIENT#${validUUID}`, entityType: 'DAILY_COUNTER' }),
      updatePatientPriorityFn: async () => {}
    };
    await assert.rejects(
      () => updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM' }, deps),
      (err) => err.code === 'PATIENT_NOT_FOUND'
    );
  });

  await t.test('Priority - malformed stored suggested priority fails safely', async () => {
    const patient = createValidPatient({
      aiAssessment: { suggestedPriority: 'CRITICAL' } // malformed
    });
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientPriorityFn: async () => {}
    };
    await assert.rejects(
      () => updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM' }, deps),
      (err) => err instanceof ApiError && err.code === 'INTERNAL_ERROR' && err.statusCode === 500
    );
  });

  await t.test('Priority - malformed stored status fails safely', async () => {
    const patient = createValidPatient({
      status: 'DISCHARGED' // malformed status
    });
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientPriorityFn: async () => {}
    };
    await assert.rejects(
      () => updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM' }, deps),
      (err) => err.code === 'INTERNAL_ERROR'
    );
  });

  await t.test('Priority - DB conditional check failed throws UPDATE_CONFLICT', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientPriorityFn: async () => {
        throw new ApiError('UPDATE_CONFLICT', 409, 'Conflict occurred');
      },
      nowFn: fixedNow
    };

    await assert.rejects(
      () => updatePriorityService(validUUID, { confirmedPriority: 'MEDIUM' }, deps),
      (err) => err.code === 'UPDATE_CONFLICT' && err.statusCode === 409
    );
  });

  await t.test('Status - WAITING to IN_PROGRESS succeeds', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientStatusFn: async (id, params) => {
        assert.equal(params.newStatus, 'IN_PROGRESS');
        assert.equal(params.expectedCurrentStatus, 'WAITING');
        assert.equal(params.updatedAt, fixedNow().toISOString());
        return {
          ...patient,
          status: 'IN_PROGRESS',
          updatedAt: params.updatedAt
        };
      },
      nowFn: fixedNow
    };

    const res = await updateStatusService(validUUID, { status: 'IN_PROGRESS' }, deps);
    assert.equal(res.status, 'IN_PROGRESS');
    assert.equal(res.updatedAt, fixedNow().toISOString());

    // Response structure limit validations
    const resKeys = Object.keys(res);
    assert.deepEqual(resKeys.sort(), ['patientId', 'queueNumber', 'status', 'updatedAt'].sort());
  });

  await t.test('Status - IN_PROGRESS to COMPLETED succeeds', async () => {
    const patient = createValidPatient({ status: 'IN_PROGRESS' });
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientStatusFn: async (id, params) => {
        assert.equal(params.newStatus, 'COMPLETED');
        assert.equal(params.expectedCurrentStatus, 'IN_PROGRESS');
        return { ...patient, status: 'COMPLETED', updatedAt: params.updatedAt };
      },
      nowFn: fixedNow
    };

    const res = await updateStatusService(validUUID, { status: 'COMPLETED' }, deps);
    assert.equal(res.status, 'COMPLETED');
  });

  await t.test('Status - WAITING to COMPLETED is rejected (INVALID_STATUS_TRANSITION)', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientStatusFn: async () => {}
    };

    await assert.rejects(
      () => updateStatusService(validUUID, { status: 'COMPLETED' }, deps),
      (err) => err instanceof ApiError && err.code === 'INVALID_STATUS_TRANSITION' && err.statusCode === 409
    );
  });

  await t.test('Status - same-status request WAITING to WAITING is rejected (INVALID_STATUS_TRANSITION)', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientStatusFn: async () => {}
    };

    await assert.rejects(
      () => updateStatusService(validUUID, { status: 'WAITING' }, deps),
      (err) => err.code === 'INVALID_STATUS_TRANSITION'
    );
  });

  await t.test('Status - race-condition database failure throws UPDATE_CONFLICT', async () => {
    const patient = createValidPatient();
    const deps = {
      getPatientDetailsFn: async () => patient,
      updatePatientStatusFn: async () => {
        throw new ApiError('UPDATE_CONFLICT', 409, 'Status mismatch');
      },
      nowFn: fixedNow
    };

    await assert.rejects(
      () => updateStatusService(validUUID, { status: 'IN_PROGRESS' }, deps),
      (err) => err.code === 'UPDATE_CONFLICT' && err.statusCode === 409
    );
  });
});

test('Staff Actions - Repository Tests', async (t) => {
  await t.test('Priority Update constructs correct UpdateCommand details and condition checks', async () => {
    const mockDocClient = {
      send: async (command) => {
        const input = command.input;
        assert.equal(input.TableName, 'MockTable');
        assert.equal(input.Key.id, `PATIENT#${validUUID}`);
        assert.equal(
          input.ConditionExpression,
          'attribute_exists(id) AND entityType = :checkinEntityType AND #updatedAt = :expectedUpdatedAt'
        );
        assert.equal(input.ExpressionAttributeNames['#updatedAt'], 'updatedAt');
        assert.equal(input.ExpressionAttributeValues[':checkinEntityType'], 'PATIENT_CHECKIN');
        assert.equal(input.ExpressionAttributeValues[':expectedUpdatedAt'], '2026-06-23T14:30:00.000Z');
        assert.equal(input.ExpressionAttributeValues[':rb'], null); // reviewedBy is always null
        assert.equal(input.ExpressionAttributeValues[':rdn'], 'Dr. Smith'); // reviewerDisplayName passed through
        assert.equal(input.ReturnValues, 'ALL_NEW');
        return { Attributes: { patientId: validUUID, status: 'WAITING' } };
      }
    };

    const res = await updatePatientPriority(mockDocClient, 'MockTable', validUUID, {
      confirmedPriority: 'HIGH',
      overrideReason: 'Override',
      reviewerDisplayName: 'Dr. Smith',
      reviewedAt: '2026-06-23T16:00:00.000Z',
      expectedUpdatedAt: '2026-06-23T14:30:00.000Z',
      updatedAt: '2026-06-23T16:00:00.000Z'
    });
    assert.equal(res.patientId, validUUID);
  });

  await t.test('Status Update constructs correct UpdateCommand details and expectedCurrentStatus', async () => {
    const mockDocClient = {
      send: async (command) => {
        const input = command.input;
        assert.equal(input.TableName, 'MockTable');
        assert.equal(input.ExpressionAttributeNames['#status'], 'status');
        assert.equal(input.ExpressionAttributeNames['#updatedAt'], 'updatedAt');
        assert.equal(input.ExpressionAttributeValues[':expectedCurrentStatus'], 'WAITING');
        assert.equal(
          input.ConditionExpression,
          'attribute_exists(id) AND entityType = :checkinEntityType AND #status = :expectedCurrentStatus'
        );
        return { Attributes: { patientId: validUUID, status: 'IN_PROGRESS' } };
      }
    };

    const res = await updatePatientStatus(mockDocClient, 'MockTable', validUUID, {
      newStatus: 'IN_PROGRESS',
      expectedCurrentStatus: 'WAITING',
      updatedAt: '2026-06-23T16:00:00.000Z'
    });
    assert.equal(res.status, 'IN_PROGRESS');
  });

  await t.test('Missing table name throws CONFIGURATION_ERROR', async () => {
    await assert.rejects(
      () => updatePatientPriority({}, '', validUUID, {}),
      (err) => err.code === 'CONFIGURATION_ERROR'
    );
  });
});

test('Staff Actions - Handler Behaviour & Privacy Leak Tests', async (t) => {
  await t.test('Priority - Handler returns HTTP 200 on success', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    const mockDeps = {
      serviceFn: updatePriorityService,
      getPatientDetailsFn: async () => createValidPatient(),
      updatePatientPriorityFn: async (id, params) => ({
        ...createValidPatient(),
        staffDecision: {
          confirmedPriority: 'MEDIUM',
          reviewedAt: params.reviewedAt,
          reviewedBy: null,
          overrideReason: null
        },
        updatedAt: params.updatedAt
      }),
      nowFn: fixedNow
    };

    const event = {
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: validUUID },
      body: JSON.stringify({ confirmedPriority: 'MEDIUM' })
    };

    const updatePriorityHandler = createUpdatePriorityHandler(mockDeps);
    const res = await updatePriorityHandler(event);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');

    const payload = JSON.parse(res.body);
    assert.equal(payload.success, true);
    assert.equal(payload.data.staffDecision.confirmedPriority, 'MEDIUM');
  });

  await t.test('Status - Handler returns HTTP 200 on success', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    const mockDeps = {
      serviceFn: updateStatusService,
      getPatientDetailsFn: async () => createValidPatient(),
      updatePatientStatusFn: async (id, params) => ({
        ...createValidPatient(),
        status: 'IN_PROGRESS',
        updatedAt: params.updatedAt
      }),
      nowFn: fixedNow
    };

    const event = {
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: validUUID },
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    };

    const updateStatusHandler = createUpdateStatusHandler(mockDeps);
    const res = await updateStatusHandler(event);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');

    const payload = JSON.parse(res.body);
    assert.equal(payload.success, true);
    assert.equal(payload.data.status, 'IN_PROGRESS');
  });

  await t.test('Handler - missing body returns 400 INVALID_JSON', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    const res = await productionUpdatePriorityHandler({ headers: { Authorization: 'Bearer mock-token-test@hospital.com' }, pathParameters: { patientId: validUUID } });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  await t.test('Handler - malformed JSON returns 400 INVALID_JSON', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    const res = await productionUpdatePriorityHandler({
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: validUUID },
      body: '{ bad-json }'
    });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  await t.test('Handler - unknown error returns 500 and prevents data leakage in logs or output', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';

    const originalConsoleError = console.error;
    let errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args.map(arg => typeof arg === 'string' ? arg : (arg instanceof Error ? arg.toString() + '\n' + arg.stack : JSON.stringify(arg))).join(' '));
    };

    try {
      const mockDeps = {
        serviceFn: updateStatusService,
        getPatientDetailsFn: async () => {
          throw new Error('Database connection string leaked: secretPassword');
        },
        updatePatientStatusFn: async () => {}
      };

      const event = {
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID },
        body: JSON.stringify({ status: 'IN_PROGRESS' })
      };

      const updateStatusHandler = createUpdateStatusHandler(mockDeps);
      const res = await updateStatusHandler(event);
      assert.equal(res.statusCode, 500);

      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'An unexpected internal error occurred');

      // Response checks
      assert.ok(!res.body.includes('secretPassword'));
      assert.ok(!res.body.includes('Database connection string leaked'));
      assert.ok(!res.body.includes('stack'));

      // Logging validation
      assert.equal(errorLogs.length, 1);
      const logMsg = errorLogs[0];
      assert.ok(!logMsg.includes('secretPassword'));
      assert.ok(!logMsg.includes('Database connection string leaked'));
      assert.ok(!logMsg.includes('Error'));
      assert.ok(!logMsg.includes('stack'));
      assert.ok(logMsg.includes('Unhandled server error'));
    } finally {
      console.error = originalConsoleError;
    }
  });

  await t.test('Handler - known errors log safe error code only and omit messages or causes', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';

    const originalConsoleWarn = console.warn;
    let warnLogs = [];
    console.warn = (...args) => {
      warnLogs.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
    };

    try {
      const mockDeps = {
        serviceFn: updateStatusService,
        getPatientDetailsFn: async () => {
          throw new ApiError('CONFIGURATION_ERROR', 500, 'Hidden configuration reason');
        },
        updatePatientStatusFn: async () => {}
      };

      const event = {
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID },
        body: JSON.stringify({ status: 'IN_PROGRESS' })
      };

      const updateStatusHandler = createUpdateStatusHandler(mockDeps);
      const res = await updateStatusHandler(event);
      assert.equal(res.statusCode, 500);

      assert.equal(warnLogs.length, 1);
      const warnMsg = warnLogs[0];
      assert.ok(warnMsg.includes('Request failed'));
      assert.ok(warnMsg.includes('CONFIGURATION_ERROR'));
      assert.ok(!warnMsg.includes('Hidden configuration reason'));
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  await t.test('Handler - operational logs exclude details, overrideReason, or patient PII', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';

    const originalConsoleLog = console.log;
    let standardLogs = [];
    console.log = (...args) => {
      standardLogs.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
    };

    try {
      const mockDeps = {
        serviceFn: updatePriorityService,
        getPatientDetailsFn: async () => createValidPatient(),
        updatePatientPriorityFn: async (id, params) => {
          console.log('Staff priority saved');
          return {
            ...createValidPatient(),
            staffDecision: {
              confirmedPriority: 'HIGH',
              reviewedAt: params.reviewedAt,
              reviewedBy: null,
              overrideReason: 'Severe heart pain' // should NOT be logged
            },
            updatedAt: params.updatedAt
          };
        },
        nowFn: fixedNow
      };

      const event = {
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID },
        body: JSON.stringify({ confirmedPriority: 'HIGH', overrideReason: 'Severe heart pain' })
      };

      const updatePriorityHandler = createUpdatePriorityHandler(mockDeps);
      await updatePriorityHandler(event);

      // Verify that logs only contain safe static strings
      assert.ok(standardLogs.some(log => log.includes('Priority review request received')));
      assert.ok(standardLogs.some(log => log.includes('Staff priority saved')));

      // Ensure NO PII is present in standard logs
      const combinedLogs = standardLogs.join(' ');
      assert.ok(!combinedLogs.includes('Severe heart pain'));
      assert.ok(!combinedLogs.includes('Demo Patient'));
      assert.ok(!combinedLogs.includes('0200000000'));
    } finally {
      console.log = originalConsoleLog;
    }
  });
});
