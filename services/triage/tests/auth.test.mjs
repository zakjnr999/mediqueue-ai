import test from 'node:test';
import assert from 'node:assert';
import { validateLoginRequest } from '../src/validation/validate-login-request.mjs';
import { loginService } from '../src/services/login-service.mjs';
import { createHandler, handler as productionHandler } from '../src/handlers/login.mjs';
import { requireAuthentication } from '../src/middleware/auth-middleware.mjs';
import { ApiError } from '../src/errors/api-error.mjs';

test('Authentication - Input Validation', async (t) => {
  await t.test('accepts valid email and password', () => {
    const res = validateLoginRequest({
      email: ' staff@hospital.com ',
      password: 'SecurePassword123!'
    });
    assert.equal(res.email, 'staff@hospital.com');
    assert.equal(res.password, 'SecurePassword123!');
  });

  await t.test('rejects missing email', () => {
    assert.throws(
      () => validateLoginRequest({ password: 'Password123' }),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.message.includes('email is required')
    );
  });

  await t.test('rejects empty email', () => {
    assert.throws(
      () => validateLoginRequest({ email: '   ', password: 'Password123' }),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.message.includes('email cannot be empty')
    );
  });

  await t.test('rejects malformed email', () => {
    assert.throws(
      () => validateLoginRequest({ email: 'notanemail', password: 'Password123' }),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.message.includes('valid email address')
    );
  });

  await t.test('rejects missing password', () => {
    assert.throws(
      () => validateLoginRequest({ email: 'staff@hospital.com' }),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.message.includes('password is required')
    );
  });

  await t.test('rejects empty password', () => {
    assert.throws(
      () => validateLoginRequest({ email: 'staff@hospital.com', password: '' }),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.message.includes('password cannot be empty')
    );
  });

  await t.test('rejects unexpected properties', () => {
    assert.throws(
      () => validateLoginRequest({ email: 'staff@hospital.com', password: 'password', extra: 'value' }),
      (err) => err instanceof ApiError && err.code === 'VALIDATION_ERROR'
    );
  });
});

test('Authentication - Service Operations', async (t) => {
  await t.test('returns mapped tokens on successful initiateAuth', async () => {
    const mockDeps = {
      initiateAuthFn: async (email, password) => {
        assert.equal(email, 'staff@hospital.com');
        assert.equal(password, 'SecurePassword123!');
        return {
          AuthenticationResult: {
            AccessToken: 'mock-access',
            IdToken: 'mock-id',
            RefreshToken: 'mock-refresh',
            ExpiresIn: 3600
          }
        };
      }
    };

    const res = await loginService(
      { email: 'staff@hospital.com', password: 'SecurePassword123!' },
      mockDeps
    );

    assert.equal(res.accessToken, 'mock-access');
    assert.equal(res.idToken, 'mock-id');
    assert.equal(res.refreshToken, 'mock-refresh');
    assert.equal(res.expiresIn, 3600);
  });

  await t.test('maps NotAuthorizedException to 401', async () => {
    const mockDeps = {
      initiateAuthFn: async () => {
        const err = new Error('Incorrect username or password.');
        err.name = 'NotAuthorizedException';
        throw err;
      }
    };

    await assert.rejects(
      () => loginService({ email: 'staff@hospital.com', password: 'wrong' }, mockDeps),
      (err) => err instanceof ApiError && err.code === 'UNAUTHORIZED' && err.statusCode === 401 && err.message === 'Invalid email or password'
    );
  });

  await t.test('maps UserNotFoundException to generic 401', async () => {
    const mockDeps = {
      initiateAuthFn: async () => {
        const err = new Error('User does not exist.');
        err.name = 'UserNotFoundException';
        throw err;
      }
    };

    await assert.rejects(
      () => loginService({ email: 'nonexistent@hospital.com', password: 'password' }, mockDeps),
      (err) => err instanceof ApiError && err.code === 'UNAUTHORIZED' && err.message === 'Invalid email or password'
    );
  });

  await t.test('maps PasswordResetRequiredException to 400 PASSWORD_RESET_REQUIRED', async () => {
    const mockDeps = {
      initiateAuthFn: async () => {
        const err = new Error('Password reset required.');
        err.name = 'PasswordResetRequiredException';
        throw err;
      }
    };

    await assert.rejects(
      () => loginService({ email: 'staff@hospital.com', password: 'password' }, mockDeps),
      (err) => err instanceof ApiError && err.code === 'PASSWORD_RESET_REQUIRED' && err.statusCode === 400
    );
  });
});

test('Authentication - Lambda Handler Behaviour', async (t) => {
  await t.test('returns 200 on successful login', async () => {
    process.env.COGNITO_USER_POOL_CLIENT_ID = 'mock-client-id';

    const mockDeps = {
      serviceFn: loginService,
      initiateAuthFn: async () => ({
        AuthenticationResult: {
          AccessToken: 'mock-access',
          IdToken: 'mock-id',
          RefreshToken: 'mock-refresh',
          ExpiresIn: 3600
        }
      })
    };

    const event = {
      body: JSON.stringify({ email: 'staff@hospital.com', password: 'password' })
    };

    const loginHandler = createHandler(mockDeps);
    const res = await loginHandler(event);
    assert.equal(res.statusCode, 200);

    const body = JSON.parse(res.body);
    assert.equal(body.success, true);
    assert.equal(body.data.accessToken, 'mock-access');
  });

  await t.test('returns 500 when COGNITO_USER_POOL_CLIENT_ID is missing', async () => {
    delete process.env.COGNITO_USER_POOL_CLIENT_ID;

    const event = {
      body: JSON.stringify({ email: 'staff@hospital.com', password: 'password' })
    };

    const loginHandler = createHandler({
      serviceFn: loginService,
      initiateAuthFn: async () => ({})
    });
    const res = await loginHandler(event);
    assert.equal(res.statusCode, 500);

    const body = JSON.parse(res.body);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'CONFIGURATION_ERROR');
  });
});

test('Authentication - Route Middleware', async (t) => {
  await t.test('authenticates valid API Gateway Authorizer claims', () => {
    const event = {
      requestContext: {
        authorizer: {
          claims: {
            email: 'staff@hospital.com',
            sub: 'user-sub-123',
            name: 'Dr. Jones'
          }
        }
      }
    };

    const identity = requireAuthentication(event);
    assert.equal(identity.email, 'staff@hospital.com');
    assert.equal(identity.sub, 'user-sub-123');
    assert.equal(identity.displayName, 'Dr. Jones');
  });

  await t.test('authenticates valid mock Bearer tokens', () => {
    const event = {
      headers: {
        Authorization: 'Bearer mock-token-test@hospital.com'
      }
    };

    const identity = requireAuthentication(event);
    assert.equal(identity.email, 'test@hospital.com');
    assert.equal(identity.sub, 'mock-sub-1234');
    assert.equal(identity.displayName, 'Mock Staff User');
  });

  await t.test('rejects missing authentication details', () => {
    const event = {
      headers: {}
    };

    assert.throws(
      () => requireAuthentication(event),
      (err) => err instanceof ApiError && err.code === 'UNAUTHORIZED' && err.statusCode === 401
    );
  });

  await t.test('rejects malformed Bearer token format', () => {
    const event = {
      headers: {
        Authorization: 'Bearer invalidtoken'
      }
    };

    assert.throws(
      () => requireAuthentication(event),
      (err) => err.code === 'UNAUTHORIZED'
    );
  });
});
