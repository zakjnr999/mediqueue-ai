import test from 'node:test';
import assert from 'node:assert';
import { createCheckinService } from '../src/services/create-checkin-service.mjs';
import { validateCheckinRequest } from '../src/validation/validate-checkin-request.mjs';
import { savePatientCheckin } from '../src/repositories/patient-repository.mjs';
import { generateQueueNumber } from '../src/queue/generate-queue-number.mjs';
import { CheckinError } from '../src/errors/checkin-error.mjs';
import { handler } from '../src/handlers/create-checkin.mjs';

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
      createdAt: '2026-06-23T14:30:00.000Z'
    });
  });

  await t.test('2. Missing or empty fields in request throws validation error', () => {
    const invalid = { age: 30, symptoms: ['Cough'] };
    assert.throws(() => validateCheckinRequest(invalid), (err) => {
      return err instanceof CheckinError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400;
    });
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

  await t.test('9. Queue number generator and save are not called when Bedrock triage fails', async () => {
    let queueGenCalled = false;
    let saveCalled = false;
    const deps = {
      analyseSymptomsFn: async () => {
        throw new Error('Bedrock Timeout');
      },
      generateQueueNumberFn: async () => { queueGenCalled = true; return 'MQ-1'; },
      savePatientFn: async () => { saveCalled = true; },
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    try {
      await createCheckinService(validRequest, deps);
    } catch (err) {
      assert.equal(err.code, 'TRIAGE_PROCESSING_ERROR');
    }
    assert.equal(queueGenCalled, false);
    assert.equal(saveCalled, false);
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
    const res = await handler({});
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.equal(res.headers['content-type'], 'application/json');
    assert.ok(!('cause' in body.error));
  });

  await t.test('14. Handler - malformed JSON returns 400 INVALID_JSON', async () => {
    const res = await handler({ body: '{invalid-json' });
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_JSON');
  });

  await t.test('15. Handler - valid request returns 201 with filtered attributes', async () => {
    const mockDeps = {
      analyseSymptomsFn: async () => ({
        summary: 'cough', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateQueueNumberFn: async () => 'MQ-20260623-0001',
      savePatientFn: async () => {},
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const payload = {
      fullName: 'Alice',
      age: 29,
      symptoms: ['Cough']
    };

    const res = await handler({ body: JSON.stringify(payload) }, mockDeps);
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
  });

  await t.test('16. Handler - known CheckinError is mapped to code and status', async () => {
    const mockDeps = {
      analyseSymptomsFn: async () => {
        throw new CheckinError('CONFIGURATION_ERROR', 500, 'Config issue');
      },
      generateQueueNumberFn: async () => 'MQ-1',
      savePatientFn: async () => {},
      generateIdFn: fixedId,
      nowFn: fixedNow
    };

    const payload = { fullName: 'Bob', age: 30, symptoms: ['Headache'] };
    const res = await handler({ body: JSON.stringify(payload) }, mockDeps);
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFIGURATION_ERROR');
    assert.equal(body.error.message, 'Config issue');
  });

  await t.test('17. Handler - unknown error returns 500 INTERNAL_ERROR without internal leak', async () => {
    const mockDeps = {
      analyseSymptomsFn: async () => ({
        summary: 'cough', redFlags: [], suggestedPriority: 'LOW', reason: 'ok', requiresImmediateStaffReview: false
      }),
      generateQueueNumberFn: async () => 'MQ-1',
      savePatientFn: async () => {},
      generateIdFn: () => {
        throw new Error('Database connection string leaked: secretPassword');
      },
      nowFn: fixedNow
    };

    const payload = { fullName: 'Charlie', age: 30, symptoms: ['Headache'] };
    const res = await handler({ body: JSON.stringify(payload) }, mockDeps);
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.error.message, 'An unexpected internal error occurred');
    assert.ok(!res.body.includes('secretPassword')); // No credential leak!
  });
});
