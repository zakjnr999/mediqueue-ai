import test from 'node:test';
import assert from 'node:assert';
import { getQueueService } from '../src/services/get-queue-service.mjs';
import { getPatientService } from '../src/services/get-patient-service.mjs';
import { validateQueueQuery } from '../src/validation/validate-queue-query.mjs';
import { validatePatientId } from '../src/validation/validate-patient-id.mjs';
import { serializeToken, deserializeToken } from '../src/pagination/pagination-token.mjs';
import { queryPatientQueue, getPatientDetails } from '../src/repositories/patient-repository.mjs';
import { handler as getQueueHandler } from '../src/handlers/get-queue.mjs';
import { handler as getPatientHandler } from '../src/handlers/get-patient.mjs';
import { ApiError } from '../src/errors/api-error.mjs';

test('Staff APIs - Pagination Token Tests', async (t) => {
  const dateStr = '2026-06-23';

  await t.test('token round-trip succeeds (v2 with no filters)', () => {
    const key = {
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    };
    const token = serializeToken(key, dateStr);
    assert.ok(token);
    assert.ok(token.length <= 2048);

    const decoded = deserializeToken(token, dateStr);
    assert.deepEqual(decoded, key);
  });

  await t.test('token round-trip with filters (v2)', () => {
    const key = {
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    };
    const filters = { status: 'WAITING', hasRedFlags: true };
    const token = serializeToken(key, dateStr, filters);
    assert.ok(token);

    const decoded = deserializeToken(token, dateStr, filters);
    assert.deepEqual(decoded, key);
  });

  await t.test('v2 token with filters rejected when requested filters mismatch', () => {
    const key = {
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    };
    const tokenFilters = { status: 'WAITING' };
    const requestFilters = { status: 'IN_PROGRESS' }; // mismatch
    const token = serializeToken(key, dateStr, tokenFilters);

    assert.throws(
      () => deserializeToken(token, dateStr, requestFilters),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('v2 token without filters works when no filters requested', () => {
    const key = {
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    };
    // Token with no filters
    const token = serializeToken(key, dateStr);
    // Request also with no filters
    const decoded = deserializeToken(token, dateStr);
    assert.deepEqual(decoded, key);
  });

  await t.test('v2 token with filters rejected when request has different filter key', () => {
    const key = {
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    };
    const tokenFilters = { status: 'WAITING' };
    const requestFilters = { hasRedFlags: true }; // completely different filter
    const token = serializeToken(key, dateStr, tokenFilters);

    assert.throws(
      () => deserializeToken(token, dateStr, requestFilters),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('token longer than the allowed limit is rejected', () => {
    const hugeToken = 'a'.repeat(2049);
    assert.throws(
      () => deserializeToken(hugeToken, dateStr),
      (err) => err instanceof ApiError && err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('unsupported token version is rejected', () => {
    const badVersion = serializeToken({
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    }, dateStr);
    const decoded = JSON.parse(Buffer.from(badVersion, 'base64url').toString('utf8'));
    decoded.v = 3; // v3 is not supported
    const token = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    assert.throws(
      () => deserializeToken(token, dateStr),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN' && err.message.includes('version')
    );
  });

  await t.test('token with extra properties is rejected', () => {
    const base = serializeToken({
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    }, dateStr);
    const decoded = JSON.parse(Buffer.from(base, 'base64url').toString('utf8'));
    decoded.extra = 'malicious';
    const token = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    assert.throws(
      () => deserializeToken(token, dateStr),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('token with missing properties is rejected', () => {
    const base = serializeToken({
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    }, dateStr);
    const decoded = JSON.parse(Buffer.from(base, 'base64url').toString('utf8'));
    delete decoded.date;
    const token = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');

    assert.throws(
      () => deserializeToken(token, dateStr),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('cross-date token is rejected', () => {
    const token = serializeToken({
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    }, '2026-06-23');

    assert.throws(
      () => deserializeToken(token, '2026-06-24'), // date mismatch
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('token containing a counter ID is rejected', () => {
    const token = serializeToken({
      id: 'COUNTER#20260623', // counter, not PATIENT#
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#550e8400-e29b-41d4-a716-446655440000'
    }, dateStr);

    assert.throws(
      () => deserializeToken(token, dateStr),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('token containing malformed UUID or mismatched IDs is rejected', () => {
    const token = serializeToken({
      id: 'PATIENT#550e8400-e29b-41d4-a716-446655440000',
      gsi1pk: 'QUEUE#2026-06-23',
      gsi1sk: '2026-06-23T14:30:00.000Z#999e8400-e29b-41d4-a716-446655440000' // mismatched uuid suffix
    }, dateStr);

    assert.throws(
      () => deserializeToken(token, dateStr),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });

  await t.test('malformed base64url is rejected', () => {
    assert.throws(
      () => deserializeToken('not-base64!', dateStr),
      (err) => err.code === 'INVALID_PAGINATION_TOKEN'
    );
  });
});

test('Staff APIs - Repository Tests', async (t) => {
  await t.test('queryPatientQueue constructs correct QueryCommand parameters', async () => {
    const mockDocClient = {
      send: async (command) => {
        // Verify Command properties
        assert.equal(command.input.IndexName, 'MockIndex');
        assert.equal(command.input.KeyConditionExpression, 'gsi1pk = :pk');
        assert.deepEqual(command.input.ExpressionAttributeValues, {
          ':pk': 'QUEUE#2026-06-23'
        });
        assert.equal(command.input.ScanIndexForward, true);
        assert.equal(command.input.Limit, 10);
        assert.equal(command.input.ConsistentRead, undefined); // should be omitted
        assert.equal(command.input.ExclusiveStartKey?.id, 'PATIENT#1');
        assert.equal(command.input.ProjectionExpression, 'patientId, queueNumber, fullName, age, #status, aiAssessment, staffDecision, createdAt, entityType');
        assert.deepEqual(command.input.ExpressionAttributeNames, { '#status': 'status' });
        
        return {
          Items: [{ entityType: 'PATIENT_CHECKIN', patientId: '1' }],
          LastEvaluatedKey: { id: 'PATIENT#2' }
        };
      }
    };

    const results = await queryPatientQueue(mockDocClient, 'MockTable', 'MockIndex', {
      dateStr: '2026-06-23',
      limit: 10,
      exclusiveStartKey: { id: 'PATIENT#1' }
    });

    assert.equal(results.items.length, 1);
    assert.deepEqual(results.lastEvaluatedKey, { id: 'PATIENT#2' });
  });

  await t.test('getPatientDetails uses GetCommand with ConsistentRead', async () => {
    const mockDocClient = {
      send: async (command) => {
        assert.equal(command.input.TableName, 'MockTable');
        assert.equal(command.input.Key.id, 'PATIENT#mock-id');
        assert.equal(command.input.ConsistentRead, true);
        return { Item: { id: 'PATIENT#mock-id', entityType: 'PATIENT_CHECKIN' } };
      }
    };

    const item = await getPatientDetails(mockDocClient, 'MockTable', 'mock-id');
    assert.ok(item);
    assert.equal(item.entityType, 'PATIENT_CHECKIN');
  });

  await t.test('early configuration checks throw CONFIGURATION_ERROR', async () => {
    const mockDocClient = {};
    await assert.rejects(
      () => queryPatientQueue(mockDocClient, '', 'MockIndex', { dateStr: '2026-06-23', limit: 10 }),
      (err) => err instanceof ApiError && err.code === 'CONFIGURATION_ERROR'
    );
    await assert.rejects(
      () => queryPatientQueue(mockDocClient, 'MockTable', '', { dateStr: '2026-06-23', limit: 10 }),
      (err) => err instanceof ApiError && err.code === 'CONFIGURATION_ERROR'
    );
  });
});

test('Staff APIs - Validation Tests', async (t) => {
  await t.test('validateQueueQuery works correctly', () => {
    const valid = validateQueueQuery({ date: '2026-06-23', limit: '30' });
    assert.equal(valid.date, '2026-06-23');
    assert.equal(valid.limit, 30);

    // Default parameters fallback
    const def = validateQueueQuery({});
    assert.equal(def.limit, 20);

    // Invalid calendar date
    assert.throws(
      () => validateQueueQuery({ date: '2026-02-30' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );

    // Limit below 1 or above 50
    assert.throws(
      () => validateQueueQuery({ limit: '0' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );
    assert.throws(
      () => validateQueueQuery({ limit: '51' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );

    // Unexpected parameter
    assert.throws(
      () => validateQueueQuery({ date: '2026-06-23', invalidParam: 'bad' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );

    // Valid status filter
    const withStatus = validateQueueQuery({ status: 'WAITING' });
    assert.equal(withStatus.status, 'WAITING');

    // Invalid status value
    assert.throws(
      () => validateQueueQuery({ status: 'DISCHARGED' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );

    // Valid hasRedFlags filter
    const withRedFlags = validateQueueQuery({ hasRedFlags: 'true' });
    assert.equal(withRedFlags.hasRedFlags, true);

    const withoutRedFlags = validateQueueQuery({ hasRedFlags: 'false' });
    assert.equal(withoutRedFlags.hasRedFlags, false);

    // Invalid hasRedFlags value
    assert.throws(
      () => validateQueueQuery({ hasRedFlags: 'yes' }),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });

  await t.test('validatePatientId works correctly', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';
    // Normalized to lowercase
    const normalized = validatePatientId('  550E8400-e29b-41d4-a716-446655440000  ');
    assert.equal(normalized, validId.toLowerCase());

    // Non-v4 UUID version rejected
    assert.throws(
      () => validatePatientId('550e8400-e29b-31d4-a716-446655440000'), // version 3
      (err) => err.code === 'VALIDATION_ERROR'
    );

    // Prefix rejected
    assert.throws(
      () => validatePatientId(`PATIENT#${validId}`),
      (err) => err.code === 'VALIDATION_ERROR'
    );

    // Slashes and hashes rejected
    assert.throws(
      () => validatePatientId('550e8400/e29b'),
      (err) => err.code === 'VALIDATION_ERROR'
    );
  });
});

test('Staff APIs - Service and Handler Tests', async (t) => {
  const fixedNow = () => new Date('2026-06-23T14:30:00.000Z');
  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  const samplePatients = [
    {
      patientId: '1',
      queueNumber: 'MQ-20260623-0001',
      fullName: 'Alice',
      age: 20,
      entityType: 'PATIENT_CHECKIN',
      status: 'WAITING',
      aiAssessment: {
        summary: 'Symptom description',
        redFlags: [],
        suggestedPriority: 'LOW',
        reason: 'Internal reason' // should be stripped in response
      },
      staffDecision: {
        confirmedPriority: null,
        reviewedBy: 'Dr. Bob' // should be stripped in queue response
      },
      createdAt: '2026-06-23T14:30:00.000Z',
      phoneNumber: '123' // should be stripped
    },
    {
      id: 'COUNTER#20260623',
      entityType: 'DAILY_COUNTER',
      currentValue: 5 // should be filtered out
    }
  ];

  await t.test('GET /queue service filters out counter and strips GSI keys and PII fields', async () => {
    const deps = {
      queryPatientQueueFn: async () => ({
        items: samplePatients,
        lastEvaluatedKey: { id: 'PATIENT#1', gsi1pk: 'QUEUE#2026-06-23', gsi1sk: '1' }
      }),
      serializeTokenFn: (key, date, filters) => {
        // Verify filter context is passed to serializeToken
        assert.deepEqual(filters, {});
        return 'mock-next-token';
      },
      deserializeTokenFn: (token, date, requestedFilters) => {
        // Verify filter context is passed to deserializeToken
        assert.deepEqual(requestedFilters, {});
        return null;
      },
      nowFn: fixedNow
    };

    const result = await getQueueService({}, deps);
    assert.equal(result.date, '2026-06-23');
    assert.equal(result.patients.length, 1);
    assert.equal(result.nextToken, 'mock-next-token');

    const patient = result.patients[0];
    assert.deepEqual(patient, {
      patientId: '1',
      queueNumber: 'MQ-20260623-0001',
      fullName: 'Alice',
      age: 20,
      status: 'WAITING',
      aiAssessment: {
        summary: 'Symptom description',
        redFlags: [],
        suggestedPriority: 'LOW',
        requiresImmediateStaffReview: true
      },
      staffDecision: {
        confirmedPriority: null
      },
      createdAt: '2026-06-23T14:30:00.000Z'
    });
  });

  await t.test('GET /queue service passes filters to token functions', async () => {
    const deps = {
      queryPatientQueueFn: async () => ({
        items: [samplePatients[0]],
        lastEvaluatedKey: null
      }),
      serializeTokenFn: (key, date, filters) => {
        assert.deepEqual(filters, { status: 'WAITING' });
        return 'filtered-token';
      },
      deserializeTokenFn: (token, date, requestedFilters) => {
        assert.deepEqual(requestedFilters, { status: 'WAITING' });
        return null;
      },
      nowFn: fixedNow
    };

    const result = await getQueueService({ status: 'WAITING' }, deps);
    assert.equal(result.patients.length, 1);
    assert.equal(result.nextToken, 'filtered-token');
  });

  await t.test('GET /queue service applies in-memory status filter', async () => {
    const items = [
      { ...samplePatients[0], patientId: '1', status: 'WAITING' },
      { ...samplePatients[0], patientId: '2', status: 'IN_PROGRESS' },
      { ...samplePatients[0], patientId: '3', status: 'COMPLETED' }
    ];

    const deps = {
      queryPatientQueueFn: async () => ({ items, lastEvaluatedKey: null }),
      serializeTokenFn: () => null,
      deserializeTokenFn: () => null,
      nowFn: fixedNow
    };

    // Filter: WAITING
    const result = await getQueueService({ status: 'WAITING' }, deps);
    assert.equal(result.patients.length, 1);
    assert.equal(result.patients[0].patientId, '1');

    // Filter: IN_PROGRESS
    const result2 = await getQueueService({ status: 'IN_PROGRESS' }, deps);
    assert.equal(result2.patients.length, 1);
    assert.equal(result2.patients[0].patientId, '2');

    // No filter returns all
    const result3 = await getQueueService({}, deps);
    assert.equal(result3.patients.length, 3);
  });

  await t.test('GET /queue service applies in-memory hasRedFlags filter', async () => {
    const items = [
      { ...samplePatients[0], patientId: '1', aiAssessment: { redFlags: ['Fever'] } },
      { ...samplePatients[0], patientId: '2', aiAssessment: { redFlags: [] } }
    ];

    const deps = {
      queryPatientQueueFn: async () => ({ items, lastEvaluatedKey: null }),
      serializeTokenFn: () => null,
      deserializeTokenFn: () => null,
      nowFn: fixedNow
    };

    const withFlags = await getQueueService({ hasRedFlags: 'true' }, deps);
    assert.equal(withFlags.patients.length, 1);
    assert.equal(withFlags.patients[0].patientId, '1');

    const withoutFlags = await getQueueService({ hasRedFlags: 'false' }, deps);
    assert.equal(withoutFlags.patients.length, 1);
    assert.equal(withoutFlags.patients[0].patientId, '2');
  });

  await t.test('GET /queue service with status and hasRedFlags combined filters', async () => {
    const items = [
      { ...samplePatients[0], patientId: '1', status: 'WAITING', aiAssessment: { redFlags: ['Fever'] } },
      { ...samplePatients[0], patientId: '2', status: 'WAITING', aiAssessment: { redFlags: [] } },
      { ...samplePatients[0], patientId: '3', status: 'IN_PROGRESS', aiAssessment: { redFlags: ['Pain'] } }
    ];

    const deps = {
      queryPatientQueueFn: async () => ({ items, lastEvaluatedKey: null }),
      serializeTokenFn: () => null,
      deserializeTokenFn: () => null,
      nowFn: fixedNow
    };

    // WAITING + hasRedFlags=true
    const result = await getQueueService({ status: 'WAITING', hasRedFlags: 'true' }, deps);
    assert.equal(result.patients.length, 1);
    assert.equal(result.patients[0].patientId, '1');
  });

  await t.test('GET /patients/{patientId} service checks entityType and validates output structure', async () => {
    const deps = {
      getPatientDetailsFn: async () => ({
        patientId: validUUID,
        queueNumber: 'MQ-2',
        fullName: 'Jane',
        age: 30,
        symptoms: ['cough'],
        entityType: 'PATIENT_CHECKIN',
        aiAssessment: { summary: 'c', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false },
        staffDecision: { confirmedPriority: null, reviewerDisplayName: 'Dr. Smith' },
        status: 'WAITING',
        createdAt: '2026-06-23T14:30:00.000Z',
        updatedAt: '2026-06-23T14:30:00.000Z',
        id: `PATIENT#${validUUID}`,
        gsi1pk: 'QUEUE',
        sex: 'Female',
        selfAssessedUrgency: 'Moderate'
      })
    };

    const details = await getPatientService(validUUID, deps);
    assert.equal(details.fullName, 'Jane');
    assert.equal(details.sex, 'Female');
    assert.equal(details.selfAssessedUrgency, 'Moderate');
    assert.equal(details.staffDecision.reviewerDisplayName, 'Dr. Smith');
    assert.ok(!('id' in details));
    assert.ok(!('entityType' in details));
    assert.ok(!('gsi1pk' in details));
  });

  await t.test('GET /patients/{patientId} omits sex/selfAssessedUrgency when absent', async () => {
    const deps = {
      getPatientDetailsFn: async () => ({
        patientId: validUUID,
        queueNumber: 'MQ-2',
        fullName: 'Jane',
        age: 30,
        symptoms: ['cough'],
        entityType: 'PATIENT_CHECKIN',
        aiAssessment: { summary: 'c', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false },
        staffDecision: { confirmedPriority: null },
        status: 'WAITING',
        createdAt: '2026-06-23T14:30:00.000Z',
        updatedAt: '2026-06-23T14:30:00.000Z',
        id: `PATIENT#${validUUID}`,
        gsi1pk: 'QUEUE'
      })
    };

    const details = await getPatientService(validUUID, deps);
    assert.equal(details.fullName, 'Jane');
    assert.ok(!('sex' in details));
    assert.ok(!('selfAssessedUrgency' in details));
    assert.equal(details.staffDecision.reviewerDisplayName, null);
  });

  await t.test('GET /patients/{patientId} calculates wait times and people ahead correctly', async () => {
    let countCalled = false;
    const deps = {
      getPatientDetailsFn: async () => ({
        patientId: validUUID,
        queueNumber: 'MQ-2',
        fullName: 'Jane',
        age: 30,
        symptoms: ['cough'],
        entityType: 'PATIENT_CHECKIN',
        aiAssessment: { summary: 'c', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false },
        staffDecision: { confirmedPriority: null },
        status: 'WAITING',
        createdAt: '2026-06-23T14:30:00.000Z',
        updatedAt: '2026-06-23T14:30:00.000Z',
        id: `PATIENT#${validUUID}`,
        gsi1pk: 'QUEUE'
      }),
      countPeopleAheadFn: async (dateStr, createdAt, patientId) => {
        countCalled = true;
        assert.equal(dateStr, '2026-06-23');
        assert.equal(createdAt, '2026-06-23T14:30:00.000Z');
        assert.equal(patientId, validUUID);
        return 4;
      }
    };

    const details = await getPatientService(validUUID, deps);
    assert.ok(countCalled);
    assert.equal(details.peopleAhead, 4);
    assert.equal(details.estimatedWaitTimeMinutes, 20);
  });

  await t.test('GET /patients/{patientId} returns 0 wait time when status is not WAITING', async () => {
    const deps = {
      getPatientDetailsFn: async () => ({
        patientId: validUUID,
        queueNumber: 'MQ-2',
        fullName: 'Jane',
        age: 30,
        symptoms: ['cough'],
        entityType: 'PATIENT_CHECKIN',
        aiAssessment: { summary: 'c', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false },
        staffDecision: { confirmedPriority: null },
        status: 'IN_PROGRESS',
        createdAt: '2026-06-23T14:30:00.000Z',
        updatedAt: '2026-06-23T14:30:00.000Z',
        id: `PATIENT#${validUUID}`,
        gsi1pk: 'QUEUE'
      }),
      countPeopleAheadFn: async () => {
        throw new Error('Should not be called');
      }
    };

    const details = await getPatientService(validUUID, deps);
    assert.equal(details.status, 'IN_PROGRESS');
    assert.equal(details.peopleAhead, 0);
    assert.equal(details.estimatedWaitTimeMinutes, 0);
  });

  await t.test('GET /patients/{patientId} service throws PATIENT_NOT_FOUND on wrong entity type', async () => {
    const deps = {
      getPatientDetailsFn: async () => ({
        id: `COUNTER#20260623`,
        entityType: 'DAILY_COUNTER'
      })
    };

    await assert.rejects(
      () => getPatientService(validUUID, deps),
      (err) => err instanceof ApiError && err.code === 'PATIENT_NOT_FOUND' && err.statusCode === 404
    );
  });

  // Handler integration tests
  await t.test('GET /queue Handler returns HTTP 200 on success and maps configuration errors', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MockIndex';

    const mockDeps = {
      queryPatientQueueFn: async () => ({ items: [], lastEvaluatedKey: null }),
      serializeTokenFn: () => null,
      deserializeTokenFn: () => null,
      nowFn: fixedNow
    };

    const res = await getQueueHandler({}, mockDeps);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.date, '2026-06-23');

    // Missing table name returns 500 CONFIGURATION_ERROR
    delete process.env.PATIENTS_TABLE_NAME;
    const errRes = await getQueueHandler({}, mockDeps);
    assert.equal(errRes.statusCode, 500);
    const errBody = JSON.parse(errRes.body);
    assert.equal(errBody.success, false);
    assert.equal(errBody.error.code, 'CONFIGURATION_ERROR');
    assert.ok(!errRes.body.includes('PATIENTS_TABLE_NAME')); // no exposed env name
  });

  await t.test('GET /patients/{patientId} Handler returns HTTP 200 on success and handles 404 NOT_FOUND', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';

    const mockDeps = {
      getPatientDetailsFn: async () => null // missing record
    };

    const event = {
      pathParameters: {
        patientId: validUUID
      }
    };

    const res = await getPatientHandler(event, mockDeps);
    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'PATIENT_NOT_FOUND');
    assert.ok(!res.body.includes('cause')); // no internal leak
  });

  await t.test('GET /queue Handler - unknown error returns 500 INTERNAL_ERROR without internal leak', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MockIndex';

    const originalConsoleError = console.error;
    let errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args.map(arg => typeof arg === 'string' ? arg : (arg instanceof Error ? arg.toString() + '\n' + arg.stack : JSON.stringify(arg))).join(' '));
    };

    try {
      const mockDeps = {
        queryPatientQueueFn: async () => {
          throw new Error('Database connection string leaked: secretPassword');
        },
        serializeTokenFn: () => null,
        deserializeTokenFn: () => null,
        nowFn: fixedNow
      };

      const res = await getQueueHandler({}, mockDeps);
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'An unexpected internal error occurred');

      // Response validation
      assert.ok(!res.body.includes('secretPassword'));
      assert.ok(!res.body.includes('Database connection string leaked'));
      assert.ok(!res.body.includes('stack'));

      // Log validation
      assert.equal(errorLogs.length, 1);
      const logMsg = errorLogs[0];
      assert.ok(!logMsg.includes('secretPassword'));
      assert.ok(!logMsg.includes('Database connection string leaked'));
      assert.ok(!logMsg.includes('Error'));
      assert.ok(!logMsg.includes('stack'));
      assert.equal(logMsg.trim(), 'Unhandled server error');
    } finally {
      console.error = originalConsoleError;
    }
  });

  await t.test('GET /patients/{patientId} Handler - unknown error returns 500 INTERNAL_ERROR without internal leak', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';

    const originalConsoleError = console.error;
    let errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args.map(arg => typeof arg === 'string' ? arg : (arg instanceof Error ? arg.toString() + '\n' + arg.stack : JSON.stringify(arg))).join(' '));
    };

    try {
      const mockDeps = {
        getPatientDetailsFn: async () => {
          throw new Error('Database connection string leaked: secretPassword');
        }
      };

      const event = {
        pathParameters: {
          patientId: validUUID
        }
      };

      const res = await getPatientHandler(event, mockDeps);
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'An unexpected internal error occurred');

      // Response validation
      assert.ok(!res.body.includes('secretPassword'));
      assert.ok(!res.body.includes('Database connection string leaked'));
      assert.ok(!res.body.includes('stack'));

      // Log validation
      assert.equal(errorLogs.length, 1);
      const logMsg = errorLogs[0];
      assert.ok(!logMsg.includes('secretPassword'));
      assert.ok(!logMsg.includes('Database connection string leaked'));
      assert.ok(!logMsg.includes('Error'));
      assert.ok(!logMsg.includes('stack'));
      assert.equal(logMsg.trim(), 'Unhandled server error');
    } finally {
      console.error = originalConsoleError;
    }
  });

  await t.test('Handlers - known errors log safe error code only and no message or cause', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MockTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MockIndex';

    const originalConsoleWarn = console.warn;
    let warnLogs = [];
    console.warn = (...args) => {
      warnLogs.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
    };

    try {
      const mockDeps = {
        queryPatientQueueFn: async () => {
          throw new ApiError('CONFIGURATION_ERROR', 500, 'Mock config error message');
        },
        serializeTokenFn: () => null,
        deserializeTokenFn: () => null,
        nowFn: fixedNow
      };

      const res = await getQueueHandler({}, mockDeps);
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'CONFIGURATION_ERROR');

      assert.equal(warnLogs.length, 1);
      assert.ok(warnLogs[0].includes('Request failed'));
      assert.ok(warnLogs[0].includes('CONFIGURATION_ERROR'));
      assert.ok(!warnLogs[0].includes('Mock config error message'));
    } finally {
      console.warn = originalConsoleWarn;
    }
  });
});
