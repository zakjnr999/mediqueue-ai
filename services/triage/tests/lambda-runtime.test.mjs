import test from 'node:test';
import assert from 'node:assert';
import { createHandler as createCheckinHandler } from '../src/handlers/create-checkin.mjs';
import { createHandler as createUpdateStatusHandler, handler as productionUpdateStatusHandler } from '../src/handlers/update-status.mjs';
import { ApiError } from '../src/errors/api-error.mjs';

test('Lambda Runtime and Factory Validation Tests', async (t) => {
  process.env.PATIENTS_TABLE_NAME = 'TestTable';
  process.env.PATIENTS_QUEUE_INDEX_NAME = 'TestIndex';

  const fakeContext = {
    awsRequestId: 'test-request-id-12345',
    functionName: 'MediQueueTest',
    getRemainingTimeInMillis: () => 30000
  };

  await t.test('1. Factory-created handler receives (event, fakeContext)', async () => {
    let serviceCalled = false;
    let serviceReceivedDeps = null;

    const mockService = async (body, deps) => {
      serviceCalled = true;
      serviceReceivedDeps = deps;
      return { success: true };
    };

    const handler = createUpdateStatusHandler({
      serviceFn: mockService
    });

    const event = {
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: '550e8400-e29b-41d4-a716-446655440000' },
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    };

    const res = await handler(event, fakeContext);
    assert.equal(res.statusCode, 200);
    assert.ok(serviceCalled);
    
    // Verify that the context object itself was NOT passed as the service dependency object.
    assert.notDeepEqual(serviceReceivedDeps, fakeContext);
    // Verify that the context fields are NOT returned to the client.
    const body = JSON.parse(res.body);
    assert.ok(!('awsRequestId' in body));
    assert.ok(!('functionName' in body));
  });

  await t.test('2. Unknown errors do not leak messages or stacks', async () => {
    const mockService = async () => {
      const err = new Error('Database password leaked: secret12345');
      err.stack = 'MockStackDump';
      throw err;
    };

    const handler = createUpdateStatusHandler({
      serviceFn: mockService
    });

    const event = {
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: '550e8400-e29b-41d4-a716-446655440000' },
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    };

    const originalConsoleError = console.error;
    let errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args);
    };

    try {
      const res = await handler(event, fakeContext);
      assert.equal(res.statusCode, 500);
      
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'An unexpected internal error occurred');

      // Assert no raw stacks or messages appear in client response
      assert.ok(!res.body.includes('secret12345'));
      assert.ok(!res.body.includes('MockStackDump'));

      // Assert console.error logged only unhandled error + request ID, no stack or error details
      assert.equal(errorLogs.length, 1);
      assert.deepEqual(errorLogs[0], [
        'Unhandled server error',
        { requestId: 'test-request-id-12345' }
      ]);
    } finally {
      console.error = originalConsoleError;
    }
  });

  await t.test('3. Factory validates dependencies on creation', () => {
    // Missing dependencies object throws
    assert.throws(() => createCheckinHandler(null), /Dependencies object is required/);
    
    // Missing serviceFn throws
    assert.throws(() => createCheckinHandler({}), /Dependency "serviceFn" must be a function/);
  });

  await t.test('4. Production-style handler regression test with second-argument context', async () => {
    // Invoke the actual exported production-style handler with realistic Lambda context fields
    // Ensure it doesn't try to resolve context as dependency injection and fail with configuration error first (if credentials/env are missing, it should fail safely at validation/setup without treating context as deps)
    const event = {
      headers: { Authorization: 'Bearer mock-token-test@hospital.com' },
      pathParameters: { patientId: 'invalid-id-format' }, // fails format check before reaching DynamoDB
      body: JSON.stringify({ status: 'IN_PROGRESS' })
    };

    // Make sure tables env vars are configured for verification check
    process.env.PATIENTS_TABLE_NAME = 'TestTable';

    const res = await productionUpdateStatusHandler(event, fakeContext);
    
    // Should fail with VALIDATION_ERROR (HTTP 400) because patientId format is invalid
    // If it had treated fakeContext as dependencies, it would have failed with INTERNAL_ERROR/CONFIGURATION_ERROR
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });
});
