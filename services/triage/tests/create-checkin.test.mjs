import test from 'node:test';
import assert from 'node:assert';
import { createCheckinService } from '../src/services/create-checkin-service.mjs';
import { validateCheckinRequest } from '../src/validation/validate-checkin-request.mjs';
import { savePatientCheckin } from '../src/repositories/patient-repository.mjs';
import { generateQueueNumber } from '../src/queue/generate-queue-number.mjs';
import { CheckinError } from '../src/errors/checkin-error.mjs';
import { createHandler, handler as productionHandler } from '../src/handlers/create-checkin.mjs';

test('Check-In Service Offline Mocks Tests', async (t) => {
  // Common valid data
  const validRequest = {
    fullName: '  Jane Doe  ',
    age: 45,
    phoneNumber: '  123-456-7890  ',
    symptoms: ['  Headache  ', 'Fever'],
    additionalDetails: '  Feeling unwell since this morning.  '
  };

  // Fixed timestamp for testing date logic
  const fixedNow = () => new Date('2026-06-23T14:30:00.000Z');
  const fixedId = () => 'mock-uuid-1234';

  await t.test('1. Successful check-in maps and saves items correctly', async () => {
    let saveCalled = false;
    let triageDataReceived = null;

    const deps = {
      analyseSymptomsFn: async (symptomData) => {
        triageDataReceived = symptomData;
        return {
          summary: 'Patient has fever and headache.',
          redFlags: [],
          suggestedPriority: 'MEDIUM',
          reason: 'concerning symptoms',
          requiresImmediateStaffReview: true
        };
      },
      generateQueueNumberFn: async (dateStr, nowIso) => {
        assert.equal(dateStr, '20260623');
        return 'MQ-20260623-0005';
      },
      savePatientFn: async (item) => {
        saveCalled = true;
        // Verify key structure and trimmed variables
        assert.equal(item.id, 'PATIENT#mock-uuid-1234');
        assert.equal(item.fullName, 'Jane Doe');
        assert.equal(item.phoneNumber, '123-456-7890');
        assert.equal(item.symptoms[0], 'Headache');
        assert.equal(item.additionalDetails, 'Feeling unwell since this morning.');
        assert.equal(item.queueDate, '2026-06-23');
        assert.equal(item.gsi1pk, 'QUEUE#2026-06-23');
        assert.equal(item.gsi1sk, '2026-06-23T14:30:00.000Z#mock-uuid-1234');
        assert.equal(item.staffDecision.confirmedPriority, null);
        assert.equal(item.status, 'WAITING');
      },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const response = await createCheckinService(validRequest, deps);

    assert.ok(saveCalled);
    // Verify Bedrock receives only age, symptoms, and additionalDetails (no fullName, phoneNumber, or IDs)
    assert.deepEqual(triageDataReceived, {
      age: 45,
      symptoms: ['Headache', 'Fever'],
      additionalDetails: 'Feeling unwell since this morning.'
    });

    // Verify response structure (excludes PII like fullName/phoneNumber and DynamoDB keys/GSI keys)
    // Also confirms sex/selfAssessedUrgency are NOT in response when not provided
    assert.deepEqual(response, {
      patientId: 'mock-uuid-1234',
      queueNumber: 'MQ-20260623-0005',
      status: 'WAITING',
      aiAssessment: {
        summary: 'Patient has fever and headache.',
        redFlags: [],
        suggestedPriority: 'MEDIUM',
        reason: 'concerning symptoms',
        requiresImmediateStaffReview: true
      },
      peopleAhead: 0,
      estimatedWaitTimeMinutes: 0,
      isEscalated: false,
      escalatedBy: null,
      createdAt: '2026-06-23T14:30:00.000Z'
    });
    // Confirm sensitive fields are absent when not provided
    assert.ok(!('sex' in response));
    assert.ok(!('selfAssessedUrgency' in response));
  });

  await t.test('1b. Check-in with sex and selfAssessedUrgency stores and returns them', async () => {
    let saveCalled = false;
    let savedItem = null;

    const request = {
      ...validRequest,
      sex: 'Male',
      selfAssessedUrgency: 'Urgent'
    };

    const deps = {
      analyseSymptomsFn: async (symptomData) => {
        // Verify Bedrock does NOT receive sex or selfAssessedUrgency
        assert.ok(!('sex' in symptomData));
        assert.ok(!('selfAssessedUrgency' in symptomData));
        return {
          summary: 'Patient has fever and headache.',
          redFlags: [],
          suggestedPriority: 'MEDIUM',
          reason: 'concerning symptoms',
          requiresImmediateStaffReview: true
        };
      },
      generateQueueNumberFn: async () => 'MQ-20260623-0006',
      savePatientFn: async (item) => {
        saveCalled = true;
        savedItem = item;
        // Verify sex and selfAssessedUrgency are stored
        assert.equal(item.sex, 'Male');
        assert.equal(item.selfAssessedUrgency, 'Urgent');
      },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const response = await createCheckinService(request, deps);
    assert.ok(saveCalled);
    // Verify sex and selfAssessedUrgency appear in the check-in response
    assert.equal(response.sex, 'Male');
    assert.equal(response.selfAssessedUrgency, 'Urgent');
  });

  await t.test('1c. Check-in with countPeopleAheadFn calculates wait time and peopleAhead correctly', async () => {
    let countPeopleAheadCalled = false;
    const deps = {
      analyseSymptomsFn: async () => ({
        summary: 'cough', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateQueueNumberFn: async () => 'MQ-20260623-0007',
      savePatientFn: async () => {},
      countPeopleAheadFn: async (dateStr, createdAt, patientId) => {
        countPeopleAheadCalled = true;
        assert.equal(dateStr, '2026-06-23');
        assert.equal(createdAt, '2026-06-23T14:30:00.000Z');
        assert.equal(patientId, 'mock-uuid-1234');
        return 3;
      },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const response = await createCheckinService(validRequest, deps);
    assert.ok(countPeopleAheadCalled);
    assert.equal(response.peopleAhead, 3);
    assert.equal(response.estimatedWaitTimeMinutes, 15);
  });

  await t.test('2. Missing or empty fields in request throws validation error', () => {
    const invalid = { age: 30, symptoms: ['Cough'] };
    assert.throws(() => validateCheckinRequest(invalid), (err) => {
      return err instanceof CheckinError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400;
    });
  });

  await t.test('2b. Invalid sex value is rejected', () => {
    const invalid = { ...validRequest, sex: 'InvalidSex' };
    assert.throws(() => validateCheckinRequest(invalid), (err) => {
      return err instanceof CheckinError && err.code === 'VALIDATION_ERROR';
    });
  });

  await t.test('2c. Invalid selfAssessedUrgency value is rejected', () => {
    const invalid = { ...validRequest, selfAssessedUrgency: 'VeryUrgent' };
    assert.throws(() => validateCheckinRequest(invalid), (err) => {
      return err instanceof CheckinError && err.code === 'VALIDATION_ERROR';
    });
  });

  await t.test('2d. Valid sex values are accepted', () => {
    for (const value of ['Male', 'Female', 'Prefer not to say']) {
      const res = validateCheckinRequest({ ...validRequest, sex: value });
      assert.equal(res.sex, value);
    }
  });

  await t.test('2e. Valid selfAssessedUrgency values are accepted', () => {
    for (const value of ['Minor', 'Moderate', 'Urgent']) {
      const res = validateCheckinRequest({ ...validRequest, selfAssessedUrgency: value });
      assert.equal(res.selfAssessedUrgency, value);
    }
  });

  await t.test('3. Unexpected properties are rejected', () => {
    const invalid = { ...validRequest, extraProperty: 'malicious' };
    assert.throws(() => validateCheckinRequest(invalid), (err) => {
      return err.code === 'VALIDATION_ERROR';
    });
  });

  await t.test('4. Optional empty fields are omitted consistently', async () => {
    const minimalRequest = {
      fullName: 'John Smith',
      age: 20,
      symptoms: ['Cough']
    };

    const deps = {
      analyseSymptomsFn: async () => ({
        summary: 'cough',
        redFlags: [],
        suggestedPriority: 'LOW',
        reason: 'mild symptom',
        requiresImmediateStaffReview: false
      }),
      generateQueueNumberFn: async () => 'MQ-20260623-0001',
      savePatientFn: async (item) => {
        // Assert optional fields are omitted (not undefined)
        assert.ok(!('phoneNumber' in item));
        assert.ok(!('additionalDetails' in item));
      },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    await createCheckinService(minimalRequest, deps);
  });

  await t.test('5. Reject more than 20 symptoms', () => {
    const tooManySymptoms = {
      ...validRequest,
      symptoms: Array(21).fill('Cough')
    };
    assert.throws(() => validateCheckinRequest(tooManySymptoms), (err) => {
      return err.code === 'VALIDATION_ERROR' && err.message.includes('exceeds maximum size of 20');
    });
  });

  await t.test('6. Reject symptom string longer than 100 characters', () => {
    const longSymptom = {
      ...validRequest,
      symptoms: ['a'.repeat(101)]
    };
    assert.throws(() => validateCheckinRequest(longSymptom), (err) => {
      return err.code === 'VALIDATION_ERROR' && err.message.includes('exceeds maximum length of 100');
    });
  });

  await t.test('7. Reject additional details longer than 1000 characters', () => {
    const longDetails = {
      ...validRequest,
      additionalDetails: 'a'.repeat(1001)
    };
    assert.throws(() => validateCheckinRequest(longDetails), (err) => {
      return err.code === 'VALIDATION_ERROR' && err.message.includes('exceeds maximum length of 1000');
    });
  });

  await t.test('8. DynamoDB is not called when validation fails', async () => {
    const invalid = { age: 30 }; // missing fullName
    let saveCalled = false;
    const deps = {
      analyseSymptomsFn: async () => ({}),
      generateQueueNumberFn: async () => '',
      savePatientFn: async () => { saveCalled = true; }
    };

    try {
      await createCheckinService(invalid, deps);
    } catch (err) {
      assert.equal(err.code, 'VALIDATION_ERROR');
    }
    assert.equal(saveCalled, false);
  });

  await t.test('9. Bedrock triage failure uses conservative fallback and still saves check-in', async () => {
    let queueGenCalled = false;
    let saveCalled = false;
    let savedItem = null;
    const deps = {
      analyseSymptomsFn: async () => {
        throw new Error('Bedrock Timeout');
      },
      generateQueueNumberFn: async () => { queueGenCalled = true; return 'MQ-1'; },
      savePatientFn: async (item) => {
        saveCalled = true;
        savedItem = item;
      },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const response = await createCheckinService(validRequest, deps);
    assert.equal(queueGenCalled, true);
    assert.equal(saveCalled, true);
    assert.equal(savedItem.aiAssessment.suggestedPriority, 'MEDIUM');
    assert.equal(savedItem.aiAssessment.requiresImmediateStaffReview, true);
    assert.equal(response.aiAssessment.suggestedPriority, 'MEDIUM');
    assert.equal(response.aiAssessment.requiresImmediateStaffReview, true);
    assert.match(response.aiAssessment.reason, /staff review/i);
  });

  await t.test('10. Patient save is not called when queue generation fails', async () => {
    let saveCalled = false;
    const deps = {
      analyseSymptomsFn: async () => ({
        summary: 'ok', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateQueueNumberFn: async () => {
        throw new CheckinError('QUEUE_NUMBER_ERROR', 500, 'Counter update failed');
      },
      savePatientFn: async () => { saveCalled = true; },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    try {
      await createCheckinService(validRequest, deps);
    } catch (err) {
      assert.equal(err.code, 'QUEUE_NUMBER_ERROR');
    }
    assert.equal(saveCalled, false);
  });

  await t.test('11. savePatientCheckin uses Conditional Write and throws database error on failure', async () => {
    const mockDocClient = {
      send: async (command) => {
        assert.equal(command.input.TableName, 'MockTable');
        assert.equal(command.input.ConditionExpression, 'attribute_not_exists(id)');
        throw { name: 'ConditionalCheckFailedException', message: 'Collision' };
      }
    };

    await assert.rejects(
      () => savePatientCheckin(mockDocClient, 'MockTable', { id: 'PATIENT#1' }),
      (err) => err instanceof CheckinError && err.code === 'DATABASE_ERROR'
    );
  });

  await t.test('12. generateQueueNumber throws QUEUE_NUMBER_ERROR when counter response is invalid', async () => {
    const mockDocClient = {
      send: async () => {
        return { Attributes: { currentValue: -5 } }; // invalid negative value
      }
    };

    await assert.rejects(
      () => generateQueueNumber(mockDocClient, 'MockTable', '20260623', '2026-06-23T14:30:00.000Z'),
      (err) => err instanceof CheckinError && err.code === 'QUEUE_NUMBER_ERROR'
    );
  });

  await t.test('13. Handler - missing event.body returns 400 INVALID_JSON', async () => {
    const res = await productionHandler({});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.equal(res.headers['content-type'], 'application/json');
    assert.ok(!('cause' in body.error));
  });

  await t.test('14. Handler - malformed JSON returns 400 INVALID_JSON', async () => {
    const res = await productionHandler({ body: '{invalid-json' });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  await t.test('15. Handler - valid request returns 201 with filtered attributes', async () => {
    const mockDeps = {
      serviceFn: createCheckinService,
      analyseSymptomsFn: async () => ({
        summary: 'cough', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateQueueNumberFn: async () => 'MQ-20260623-0001',
      savePatientFn: async () => {},
      countPeopleAheadFn: async () => 0,
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const payload = {
      fullName: 'Alice',
      age: 29,
      symptoms: ['Cough']
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(payload) });
    assert.equal(res.statusCode, 201);
    assert.equal(res.headers['content-type'], 'application/json');
    
    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, {
      patientId: 'mock-uuid-1234',
      queueNumber: 'MQ-20260623-0001',
      status: 'WAITING',
      aiAssessment: {
        summary: 'cough',
        redFlags: [],
        suggestedPriority: 'LOW',
        reason: 'ok',
        requiresImmediateStaffReview: false
      },
      peopleAhead: 0,
      estimatedWaitTimeMinutes: 0,
      isEscalated: false,
      escalatedBy: null,
      createdAt: '2026-06-23T14:30:00.000Z'
    });

    // Success response must exclude PII, GSI keys, DynamoDB attributes, and staffDecision
    const keys = Object.keys(body.data);
    assert.ok(!keys.includes('fullName'));
    assert.ok(!keys.includes('phoneNumber'));
    assert.ok(!keys.includes('symptoms'));
    assert.ok(!keys.includes('additionalDetails'));
    assert.ok(!keys.includes('id'));
    assert.ok(!keys.includes('entityType'));
    assert.ok(!keys.includes('gsi1pk'));
    assert.ok(!keys.includes('gsi1sk'));
    assert.ok(!keys.includes('staffDecision'));
    assert.ok(!keys.includes('sex')); // absent when not provided
    assert.ok(!keys.includes('selfAssessedUrgency')); // absent when not provided
  });

  await t.test('16. Handler - known CheckinError is mapped to code and status', async () => {
    const originalConsoleWarn = console.warn;
    let warnLogs = [];
    console.warn = (...args) => {
      warnLogs.push(args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '));
    };

    try {
      const mockDeps = {
        serviceFn: createCheckinService,
        analyseSymptomsFn: async () => {
          throw new CheckinError('CONFIGURATION_ERROR', 500, 'Config issue');
        },
        generateQueueNumberFn: async () => 'MQ-1',
        savePatientFn: async () => {},
        countPeopleAheadFn: async () => 0,
        generateIdFn: fixedId,
        nowFn: fixedNow
      };

      const payload = { fullName: 'Bob', age: 30, symptoms: ['Headache'] };
      const handler = createHandler(mockDeps);
      const res = await handler({ body: JSON.stringify(payload) });
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'CONFIGURATION_ERROR');
      assert.equal(body.error.message, 'Config issue');

      assert.equal(warnLogs.length, 1);
      assert.ok(warnLogs[0].includes('Request failed'));
      assert.ok(warnLogs[0].includes('CONFIGURATION_ERROR'));
      assert.ok(!warnLogs[0].includes('Config issue'));
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  await t.test('17. Handler - unknown error returns 500 INTERNAL_ERROR without internal leak', async () => {
    const originalConsoleError = console.error;
    let errorLogs = [];
    console.error = (...args) => {
      errorLogs.push(args.map(arg => typeof arg === 'string' ? arg : (arg instanceof Error ? arg.toString() + '\n' + arg.stack : JSON.stringify(arg))).join(' '));
    };

    try {
      const mockDeps = {
        serviceFn: createCheckinService,
        analyseSymptomsFn: async () => ({
          summary: 'cough', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false
        }),
        generateQueueNumberFn: async () => 'MQ-1',
        savePatientFn: async () => {},
        countPeopleAheadFn: async () => 0,
        generateIdFn: () => {
          throw new Error('Database connection string leaked: secretPassword');
        },
        nowFn: fixedNow
      };

      const payload = { fullName: 'Charlie', age: 30, symptoms: ['Headache'] };
      const handler = createHandler(mockDeps);
      const res = await handler({ body: JSON.stringify(payload) });
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      assert.equal(body.error.message, 'An unexpected internal error occurred');

      // Response validation
      assert.ok(!res.body.includes('secretPassword'));
      assert.ok(!res.body.includes('Database connection string leaked'));
      assert.ok(!res.body.includes('stack'));
      assert.ok(!res.body.includes('cause'));

      // Log validation
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
});

test('Check-In - Production Adapter Wiring Tests', async (t) => {
  const originalTableName = process.env.PATIENTS_TABLE_NAME;
  const originalIndexName = process.env.PATIENTS_QUEUE_INDEX_NAME;

  // Set environment variables for the test suite
  process.env.PATIENTS_TABLE_NAME = 'TestPatientsTable';
  process.env.PATIENTS_QUEUE_INDEX_NAME = 'gsi1';

  const fixedNow = () => new Date('2026-06-23T14:30:00.000Z');
  const fixedId = () => 'mock-uuid-1234';

  const validRequest = {
    fullName: 'Jane Doe',
    age: 45,
    phoneNumber: '123-456-7890',
    symptoms: ['Headache', 'Fever'],
    additionalDetails: 'Feeling unwell since this morning.'
  };

  t.after(() => {
    process.env.PATIENTS_TABLE_NAME = originalTableName;
    process.env.PATIENTS_QUEUE_INDEX_NAME = originalIndexName;
  });

  await t.test('1. generateQueueNumber receives actual doc client, table name, dateStr, nowIso (use getDocClientFn mock)', async () => {
    let receivedClient = null;
    let receivedTableName = null;
    let receivedDateStr = null;
    let receivedNowIso = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          receivedClient = mockDocClient;
          receivedTableName = command.input.TableName;
          const keyId = command.input.Key.id;
          receivedDateStr = keyId.replace('COUNTER#', '');
          receivedNowIso = command.input.ExpressionAttributeValues[':updatedAt'];
          return { Attributes: { currentValue: 1 } };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);

    assert.strictEqual(receivedClient, mockDocClient);
    assert.equal(receivedTableName, 'TestPatientsTable');
    assert.equal(receivedDateStr, '20260623');
    assert.equal(receivedNowIso, '2026-06-23T14:30:00.000Z');
  });

  await t.test('2. savePatientCheckin receives doc client, table name, and patient item', async () => {
    let receivedClient = null;
    let receivedTableName = null;
    let savedItem = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          return { Attributes: { currentValue: 1 } };
        }
        if (command.input.Item) {
          receivedClient = mockDocClient;
          receivedTableName = command.input.TableName;
          savedItem = command.input.Item;
          return {};
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);

    assert.strictEqual(receivedClient, mockDocClient);
    assert.equal(receivedTableName, 'TestPatientsTable');
    assert.ok(savedItem);
    assert.equal(savedItem.id, 'PATIENT#mock-uuid-1234');
    assert.equal(savedItem.fullName, 'Jane Doe');
  });

  await t.test('3. countPeopleAhead receives doc client, table name, index name, and {dateStr, createdAt, patientId} options object', async () => {
    let receivedClient = null;
    let receivedTableName = null;
    let receivedIndexName = null;
    let receivedQueryInput = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          return { Attributes: { currentValue: 1 } };
        }
        if (command.input.Item) {
          return {};
        }
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
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);

    assert.strictEqual(receivedClient, mockDocClient);
    assert.equal(receivedTableName, 'TestPatientsTable');
    assert.equal(receivedIndexName, 'gsi1');
    assert.ok(receivedQueryInput);
    assert.equal(receivedQueryInput.ExpressionAttributeValues[':pk'], 'QUEUE#2026-06-23');
    assert.equal(receivedQueryInput.ExpressionAttributeValues[':skLimit'], '2026-06-23T14:30:00.000Z#mock-uuid-1234');
  });

  await t.test('4. analyseSymptoms receives only { age, symptoms, additionalDetails } (no PII)', async () => {
    let receivedSymptomData = null;

    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          return { Attributes: { currentValue: 1 } };
        }
        if (command.input.Item) {
          return {};
        }
        if (command.input.Select === 'COUNT') {
          return { Count: 0 };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async (symptomsData) => {
        receivedSymptomData = symptomsData;
        return {
          summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
        };
      },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);

    assert.deepEqual(receivedSymptomData, {
      age: 45,
      symptoms: ['Headache', 'Fever'],
      additionalDetails: 'Feeling unwell since this morning.'
    });
  });

  await t.test('5. No real AWS requests — all assertions on mock client', async () => {
    let realAwsCommandSent = false;
    const mockDocClient = {
      send: async (command) => {
        if (command.input.TableName !== 'TestPatientsTable') {
          realAwsCommandSent = true;
        }
        if (command.input.UpdateExpression) {
          return { Attributes: { currentValue: 1 } };
        }
        if (command.input.Item) {
          return {};
        }
        if (command.input.Select === 'COUNT') {
          return { Count: 0 };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);
    assert.equal(realAwsCommandSent, false);
  });

  await t.test('6. Production adapter wiring completes a successful check-in with mocked infrastructure (end-to-end with getDocClientFn)', async () => {
    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          return { Attributes: { currentValue: 12 } };
        }
        if (command.input.Item) {
          return {};
        }
        if (command.input.Select === 'COUNT') {
          return { Count: 2 };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.queueNumber, 'MQ-20260623-0012');
    assert.equal(body.data.peopleAhead, 2);
    assert.equal(body.data.estimatedWaitTimeMinutes, 10);
  });

  await t.test('7. Patient record saved exactly once', async () => {
    let saveCount = 0;
    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          return { Attributes: { currentValue: 1 } };
        }
        if (command.input.Item) {
          saveCount++;
          return {};
        }
        if (command.input.Select === 'COUNT') {
          return { Count: 0 };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);
    assert.equal(saveCount, 1);
  });

  await t.test('8. Queue-number generation called exactly once', async () => {
    let queueGenCount = 0;
    const mockDocClient = {
      send: async (command) => {
        if (command.input.UpdateExpression) {
          queueGenCount++;
          return { Attributes: { currentValue: 1 } };
        }
        if (command.input.Item) {
          return {};
        }
        if (command.input.Select === 'COUNT') {
          return { Count: 0 };
        }
        return {};
      }
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });
    assert.equal(res.statusCode, 201);
    assert.equal(queueGenCount, 1);
  });

  await t.test('9. Missing PATIENTS_TABLE_NAME produces CONFIGURATION_ERROR (not a crash)', async () => {
    delete process.env.PATIENTS_TABLE_NAME;

    const mockDocClient = {
      send: async () => ({})
    };

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    try {
      const handler = createHandler(mockDeps);
      const res = await handler({ body: JSON.stringify(validRequest) });

      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.body);
      assert.equal(body.success, false);
      assert.equal(body.error.code, 'CONFIGURATION_ERROR');
      assert.ok(body.error.message.includes('PATIENTS_TABLE_NAME'));
    } finally {
      process.env.PATIENTS_TABLE_NAME = 'TestPatientsTable';
    }
  });

  await t.test('10. Infrastructure errors like docClient.send is not a function return QUEUE_NUMBER_ERROR with message \'Unable to complete patient check-in\' (not the raw message)', async () => {
    const mockDocClient = {}; // empty object, no send method

    const mockDeps = {
      serviceFn: createCheckinService,
      getDocClientFn: () => mockDocClient,
      analyseSymptomsFn: async () => ({
        summary: 'fever', redFlags: [], suggestedPriority: 'MEDIUM', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const handler = createHandler(mockDeps);
    const res = await handler({ body: JSON.stringify(validRequest) });

    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'QUEUE_NUMBER_ERROR');
    assert.equal(body.error.message, 'Unable to complete patient check-in');
    assert.ok(!res.body.includes('send is not a function'));
  });
});
