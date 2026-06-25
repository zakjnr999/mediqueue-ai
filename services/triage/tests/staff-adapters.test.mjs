import test from 'node:test';
import assert from 'node:assert';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { createHandler as createGetPatientHandler, handler as getPatientProdHandler } from '../src/handlers/get-patient.mjs';
import { createHandler as createGetStatsHandler, handler as getStatsProdHandler } from '../src/handlers/get-stats.mjs';
import { createHandler as createUpdateStatusHandler, handler as updateStatusProdHandler } from '../src/handlers/update-status.mjs';
import { createHandler as createUpdatePriorityHandler, handler as updatePriorityProdHandler } from '../src/handlers/update-priority.mjs';
import { createHandler as createEscalatePatientHandler, handler as escalatePatientProdHandler } from '../src/handlers/escalate-patient.mjs';
import { handler as getQueueProdHandler } from '../src/handlers/get-queue.mjs';

test('Staff Handlers - Production Adapter Wiring and Error Safety Tests', async (t) => {
  const origTableName = process.env.PATIENTS_TABLE_NAME;
  const origIndexName = process.env.PATIENTS_QUEUE_INDEX_NAME;
  const origAwsRegion = process.env.AWS_REGION;

  const validUUID = '550e8400-e29b-41d4-a716-446655440000';

  t.before(() => {
    process.env.AWS_REGION = 'us-west-2';
  });

  t.after(() => {
    process.env.PATIENTS_TABLE_NAME = origTableName;
    process.env.PATIENTS_QUEUE_INDEX_NAME = origIndexName;
    process.env.AWS_REGION = origAwsRegion;
  });

  await t.test('1. getPatientDetails receives actual client, table name, and patient ID', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MyPatientsTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MyIndex';

    let receivedClient = null;
    let receivedTableName = null;
    let receivedPatientId = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.Key) {
          receivedClient = mockDocClient;
          receivedTableName = command.input.TableName;
          receivedPatientId = command.input.Key.id.replace('PATIENT#', '');
          return { Item: { id: `PATIENT#${validUUID}`, entityType: 'PATIENT_CHECKIN', status: 'WAITING', createdAt: '2026-06-23T14:30:00.000Z' } };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: async (id, deps) => {
        return await deps.getPatientDetailsFn(id);
      },
      getDocClientFn: () => mockDocClient
    };

    const handler = createGetPatientHandler(mockDeps);
    const res = await handler({
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: validUUID }
    });

    assert.equal(res.statusCode, 200);
    assert.strictEqual(receivedClient, mockDocClient);
    assert.equal(receivedTableName, 'MyPatientsTable');
    assert.equal(receivedPatientId, validUUID);
  });

  await t.test('2. countPeopleAhead receives client, table, index, and correctly shaped options', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MyPatientsTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MyIndex';

    let receivedClient = null;
    let receivedTableName = null;
    let receivedIndexName = null;
    let receivedQueryInput = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.Select === 'COUNT') {
          receivedClient = mockDocClient;
          receivedTableName = command.input.TableName;
          receivedIndexName = command.input.IndexName;
          receivedQueryInput = command.input;
          return { Count: 3 };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: async (id, deps) => {
        return await deps.countPeopleAheadFn('2026-06-23', '2026-06-23T14:30:00.000Z', id);
      },
      getDocClientFn: () => mockDocClient
    };

    const handler = createGetPatientHandler(mockDeps);
    const res = await handler({
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: validUUID }
    });

    assert.equal(res.statusCode, 200);
    assert.strictEqual(receivedClient, mockDocClient);
    assert.equal(receivedTableName, 'MyPatientsTable');
    assert.equal(receivedIndexName, 'MyIndex');
    assert.ok(receivedQueryInput);
    assert.equal(receivedQueryInput.ExpressionAttributeValues[':pk'], 'QUEUE#2026-06-23');
    assert.equal(receivedQueryInput.ExpressionAttributeValues[':skLimit'], `2026-06-23T14:30:00.000Z#${validUUID}`);
  });

  await t.test('3. queryAllPatientsForDate receives client, table, index, and date', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MyPatientsTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MyIndex';

    let receivedClient = null;
    let receivedTableName = null;
    let receivedIndexName = null;
    let pkQueried = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.IndexName) {
          receivedClient = mockDocClient;
          receivedTableName = command.input.TableName;
          receivedIndexName = command.input.IndexName;
          pkQueried = command.input.ExpressionAttributeValues[':pk'];
          return { Items: [] };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: async (params, deps) => {
        return await deps.queryAllPatientsForDateFn('2026-06-23');
      },
      getDocClientFn: () => mockDocClient,
      nowFn: () => new Date()
    };

    const handler = createGetStatsHandler(mockDeps);
    const res = await handler({
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      queryStringParameters: { date: '2026-06-23' }
    });

    assert.equal(res.statusCode, 200);
    assert.strictEqual(receivedClient, mockDocClient);
    assert.equal(receivedTableName, 'MyPatientsTable');
    assert.equal(receivedIndexName, 'MyIndex');
    assert.equal(pkQueried, 'QUEUE#2026-06-23');
  });

  await t.test('4. Authentication remains required across handlers', async () => {
    const handlers = [
      getPatientProdHandler,
      getStatsProdHandler,
      updateStatusProdHandler,
      updatePriorityProdHandler,
      escalatePatientProdHandler,
      getQueueProdHandler
    ];

    for (const h of handlers) {
      const res = await h({ headers: {} }); // No Authorization header
      assert.equal(res.statusCode, 401);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'UNAUTHORIZED');
    }
  });

  await t.test('5. Missing configurations return safe CONFIGURATION_ERROR (not a crash)', async () => {
    delete process.env.PATIENTS_TABLE_NAME;
    delete process.env.PATIENTS_QUEUE_INDEX_NAME;

    const event = {
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: validUUID },
      queryStringParameters: { date: '2026-06-23' },
      body: JSON.stringify({ status: 'IN_PROGRESS', confirmedPriority: 'HIGH' })
    };

    const handlers = [
      getPatientProdHandler,
      getStatsProdHandler,
      updateStatusProdHandler,
      updatePriorityProdHandler,
      escalatePatientProdHandler,
      getQueueProdHandler
    ];

    for (const h of handlers) {
      const res = await h(event);
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'CONFIGURATION_ERROR');
      assert.equal(body.error.message, 'Unable to process request');
      assert.ok(!res.body.includes('PATIENTS_TABLE_NAME'));
    }
  });

  await t.test('6. Internal database failures return safe messages (no leakage)', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MyPatientsTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MyIndex';

    const originalSend = DynamoDBDocumentClient.prototype.send;
    DynamoDBDocumentClient.prototype.send = async () => {
      throw new Error('AccessDeniedException: secretKey=XYZ Table=MyPatientsTable');
    };

    try {
      const event = {
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID },
        queryStringParameters: { date: '2026-06-23' },
        body: JSON.stringify({ status: 'IN_PROGRESS', confirmedPriority: 'HIGH' })
      };

      const handlers = [
        getPatientProdHandler,
        getStatsProdHandler,
        updateStatusProdHandler,
        updatePriorityProdHandler,
        escalatePatientProdHandler,
        getQueueProdHandler
      ];

      for (const h of handlers) {
        const res = await h(event);
        assert.equal(res.statusCode, 500);
        const body = JSON.parse(res.body);
        assert.equal(body.success, false);
        assert.ok(['DATABASE_ERROR', 'INTERNAL_ERROR'].includes(body.error.code));
        assert.ok(!res.body.includes('secretKey'));
        assert.ok(!res.body.includes('MyPatientsTable'));
        assert.ok(body.error.message === 'Unable to process request' || body.error.message === 'An unexpected internal error occurred');
      }
    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  await t.test('7. End-to-end production wiring works for getPatient, getStats, and updateStatus', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MyPatientsTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MyIndex';

    const originalSend = DynamoDBDocumentClient.prototype.send;
    let lastKey = null;

    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command.input.Key) {
        lastKey = command.input.Key.id;
        return { Item: { id: `PATIENT#${validUUID}`, entityType: 'PATIENT_CHECKIN', status: 'WAITING', createdAt: '2026-06-23T14:30:00.000Z' } };
      }
      if (command.input.IndexName) {
        return { Items: [] };
      }
      return {};
    };

    try {
      const res1 = await getPatientProdHandler({
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID }
      });
      assert.equal(res1.statusCode, 200);
      assert.equal(lastKey, `PATIENT#${validUUID}`);

      const res2 = await getStatsProdHandler({
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        queryStringParameters: { date: '2026-06-23' }
      });
      assert.equal(res2.statusCode, 200);
    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });

  await t.test('8. End-to-end production wiring works for updatePriority, escalatePatient, and getQueue', async () => {
    process.env.PATIENTS_TABLE_NAME = 'MyPatientsTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'MyIndex';

    const originalSend = DynamoDBDocumentClient.prototype.send;
    DynamoDBDocumentClient.prototype.send = async (command) => {
      if (command.input.Key && command.input.Key.id === `PATIENT#${validUUID}`) {
        if (command.input.UpdateExpression) {
          return { Attributes: { id: `PATIENT#${validUUID}`, entityType: 'PATIENT_CHECKIN', status: 'WAITING', updatedAt: '2026-06-23T14:30:00.000Z' } };
        }
        return { Item: { id: `PATIENT#${validUUID}`, entityType: 'PATIENT_CHECKIN', status: 'WAITING', updatedAt: '2026-06-23T14:30:00.000Z', suggestedPriority: 'MEDIUM' } };
      }
      if (command.input.IndexName) {
        return { Items: [] };
      }
      return {};
    };

    try {
      const res1 = await updatePriorityProdHandler({
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID },
        body: JSON.stringify({ confirmedPriority: 'HIGH', reviewerDisplayName: 'Dr. Smith' })
      });
      assert.equal(res1.statusCode, 200);

      const res2 = await escalatePatientProdHandler({
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        pathParameters: { patientId: validUUID },
        body: JSON.stringify({ reviewerDisplayName: 'Nurse Brenda' })
      });
      assert.equal(res2.statusCode, 200);

      const res3 = await getQueueProdHandler({
        headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
        queryStringParameters: { date: '2026-06-23' }
      });
      assert.equal(res3.statusCode, 200);
    } finally {
      DynamoDBDocumentClient.prototype.send = originalSend;
    }
  });
});
