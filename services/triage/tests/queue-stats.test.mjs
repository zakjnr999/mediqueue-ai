import { test } from 'node:test';
import assert from 'node:assert';
import { validateStatsQuery } from '../src/validation/validate-stats-query.mjs';
import { getStatsService } from '../src/services/get-stats-service.mjs';
import { handler } from '../src/handlers/get-stats.mjs';
import { ApiError } from '../src/errors/api-error.mjs';

test('Queue Stats - Validation Tests', async (t) => {
  await t.test('accepts valid calendar date', () => {
    const result = validateStatsQuery({ date: '2026-06-24' });
    assert.equal(result.date, '2026-06-24');
  });

  await t.test('defaults to today when date is missing', () => {
    const result = validateStatsQuery({});
    const todayStr = new Date().toISOString().slice(0, 10);
    assert.equal(result.date, todayStr);
  });

  await t.test('rejects unexpected query parameters', () => {
    assert.throws(() => validateStatsQuery({ date: '2026-06-24', extra: 'foo' }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400;
    });
  });

  await t.test('rejects malformed dates', () => {
    assert.throws(() => validateStatsQuery({ date: '2026/06/24' }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400;
    });
    assert.throws(() => validateStatsQuery({ date: '2026-02-30' }), (err) => {
      return err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.statusCode === 400;
    });
  });
});

test('Queue Stats - Service Calculations', async (t) => {
  const fixedNow = () => new Date('2026-06-24T12:00:00.000Z');

  await t.test('correctly aggregates check-ins', async () => {
    const mockPatients = [
      // 1. Waiting - no red flags
      {
        entityType: 'PATIENT_CHECKIN',
        status: 'WAITING',
        createdAt: '2026-06-24T11:00:00.000Z',
        updatedAt: '2026-06-24T11:00:00.000Z'
      },
      // 2. Waiting - with red flags
      {
        entityType: 'PATIENT_CHECKIN',
        status: 'WAITING',
        aiAssessment: { redFlags: ['Severe pain'] },
        createdAt: '2026-06-24T11:10:00.000Z',
        updatedAt: '2026-06-24T11:10:00.000Z'
      },
      // 3. In Progress - waited 20 mins
      {
        entityType: 'PATIENT_CHECKIN',
        status: 'IN_PROGRESS',
        createdAt: '2026-06-24T11:00:00.000Z',
        updatedAt: '2026-06-24T11:20:00.000Z'
      },
      // 4. Completed - waited 10 mins (consultation doesn't separate, updatedAt used)
      {
        entityType: 'PATIENT_CHECKIN',
        status: 'COMPLETED',
        createdAt: '2026-06-24T11:00:00.000Z',
        updatedAt: '2026-06-24T11:10:00.000Z'
      },
      // 5. Daily Counter (should be filtered out)
      {
        entityType: 'DAILY_COUNTER',
        currentValue: 12
      }
    ];

    const deps = {
      queryAllPatientsForDateFn: async (dateStr) => {
        assert.equal(dateStr, '2026-06-24');
        return mockPatients;
      },
      nowFn: fixedNow
    };

    const stats = await getStatsService({ date: '2026-06-24' }, deps);

    assert.equal(stats.date, '2026-06-24');
    assert.equal(stats.inQueue, 3); // 2 WAITING + 1 IN_PROGRESS
    assert.equal(stats.redFlags, 1); // 1 active WAITING with red flags
    assert.equal(stats.seenToday, 1); // 1 COMPLETED
    // Average wait time: (20 mins + 10 mins) / 2 patients seen = 15 mins
    assert.equal(stats.avgWaitTimeMinutes, 15);
  });

  await t.test('handles empty queue date gracefully', async () => {
    const deps = {
      queryAllPatientsForDateFn: async () => [],
      nowFn: fixedNow
    };

    const stats = await getStatsService({ date: '2026-06-24' }, deps);

    assert.equal(stats.inQueue, 0);
    assert.equal(stats.avgWaitTimeMinutes, 0);
    assert.equal(stats.redFlags, 0);
    assert.equal(stats.seenToday, 0);
  });
});

test('Queue Stats - Handler Behaviour', async (t) => {
  const envBackup = { ...process.env };

  t.afterEach(() => {
    process.env = { ...envBackup };
  });

  await t.test('returns 200 on successful query', async () => {
    process.env.PATIENTS_TABLE_NAME = 'TestTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'TestIndex';

    const mockDeps = {
      queryAllPatientsForDateFn: async () => [
        {
          entityType: 'PATIENT_CHECKIN',
          status: 'WAITING',
          createdAt: '2026-06-24T11:00:00.000Z',
          updatedAt: '2026-06-24T11:00:00.000Z'
        }
      ]
    };

    const res = await handler({ queryStringParameters: { date: '2026-06-24' } }, mockDeps);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.deepEqual(body.data, {
      date: '2026-06-24',
      inQueue: 1,
      avgWaitTimeMinutes: 0,
      redFlags: 0,
      seenToday: 0
    });
  });

  await t.test('returns 500 when configurations are missing', async () => {
    delete process.env.PATIENTS_TABLE_NAME;
    delete process.env.PATIENTS_QUEUE_INDEX_NAME;

    const res = await handler({ queryStringParameters: {} });
    assert.equal(res.statusCode, 500);

    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFIGURATION_ERROR');
  });

  await t.test('returns 500 without leaking database details on unknown errors', async () => {
    process.env.PATIENTS_TABLE_NAME = 'TestTable';
    process.env.PATIENTS_QUEUE_INDEX_NAME = 'TestIndex';

    const mockDeps = {
      queryAllPatientsForDateFn: async () => {
        throw new Error('Database connection string leaked: secretPassword123');
      }
    };

    const res = await handler({ queryStringParameters: {} }, mockDeps);
    assert.equal(res.statusCode, 500);

    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    // Ensure leakage is prevented
    assert.ok(!res.body.includes('secretPassword123'));
  });
});
