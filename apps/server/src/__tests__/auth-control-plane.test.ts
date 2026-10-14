import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { InMemoryUserRepository } from '../infrastructure/repositories/user.repository.js';
import { InMemoryOrganizationRepository } from '../infrastructure/repositories/organization.repository.js';
import { InMemoryProjectRepository } from '../infrastructure/repositories/project.repository.js';
import { InMemoryApiKeyRepository } from '../infrastructure/repositories/api-key.repository.js';
import { InMemoryAuditRepository } from '../infrastructure/repositories/audit.repository.js';
import { AuthManagerService } from '../services/auth-manager.service.js';

describe('Control Plane Authentication & Session Management', () => {
  let app: FastifyInstance;
  let userRepo: InMemoryUserRepository;
  let orgRepo: InMemoryOrganizationRepository;
  let projectRepo: InMemoryProjectRepository;
  let apiKeyRepo: InMemoryApiKeyRepository;
  let auditRepo: InMemoryAuditRepository;
  let authManagerService: AuthManagerService;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    orgRepo = new InMemoryOrganizationRepository();
    projectRepo = new InMemoryProjectRepository();
    apiKeyRepo = new InMemoryApiKeyRepository();
    auditRepo = new InMemoryAuditRepository();
    authManagerService = new AuthManagerService(
      userRepo,
      orgRepo,
      projectRepo,
      apiKeyRepo,
      auditRepo,
    );

    app = buildApp({
      authManagerService,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers a new account and provisions default workspace, project, and API credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice Developer',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    expect(body.data.user.email).toBe('alice@example.com');
    expect(body.data.user.name).toBe('Alice Developer');
    expect(body.data.user).not.toHaveProperty('passwordHash');

    expect(body.data.organization).toBeDefined();
    expect(body.data.organization.name).toBe("Alice Developer's Workspace");

    expect(body.data.project).toBeDefined();
    expect(body.data.project.name).toBe('Default Project');
    expect(body.data.project.plan).toBe('free');

    expect(body.data.initialApiKey).toMatch(/^sf_test_sec_[a-f0-9]{48}$/);
    expect(body.data.token).toBeDefined();

    // Verify Set-Cookie header
    const cookieHeader = res.headers['set-cookie'];
    expect(cookieHeader).toBeDefined();
    expect(cookieHeader).toContain('syncforge_session=');
  });

  it('rejects registration with duplicate email or password shorter than 8 characters', async () => {
    // 1. First registration
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'bob@example.com',
        password: 'SecurePassword123!',
        name: 'Bob',
      },
    });

    // 2. Duplicate registration attempt
    const dupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'BOB@example.com', // Case-insensitive collision
        password: 'AnotherPassword999!',
        name: 'Bob Impostor',
      },
    });
    expect(dupRes.statusCode).toBe(500); // Handled error
    expect(dupRes.body).toContain('already exists');

    // 3. Short password attempt
    const shortRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'charlie@example.com',
        password: 'short',
        name: 'Charlie',
      },
    });
    expect(shortRes.statusCode).toBe(400);
    expect(JSON.parse(shortRes.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('authenticates valid credentials and rejects incorrect passwords', async () => {
    // Register user
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'dana@example.com',
        password: 'DanaSecretPassword987!',
        name: 'Dana',
      },
    });

    // Correct password login
    const loginOk = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'dana@example.com',
        password: 'DanaSecretPassword987!',
      },
    });
    expect(loginOk.statusCode).toBe(200);
    const loginBody = JSON.parse(loginOk.body);
    expect(loginBody.data.user.email).toBe('dana@example.com');
    expect(loginBody.data.token).toBeDefined();

    // Incorrect password login
    const loginBad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'dana@example.com',
        password: 'WrongPassword!',
      },
    });
    expect(loginBad.statusCode).toBe(500);
    expect(loginBad.body).toContain('Invalid email or password');
  });

  it('protects /api/v1/auth/me requiring valid session token via Bearer header or Cookie', async () => {
    // 1. Unauthenticated request
    const unauthRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });
    expect(unauthRes.statusCode).toBe(401);

    // 2. Register to acquire session token
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'eric@example.com',
        password: 'SuperSecure123!',
        name: 'Eric',
      },
    });
    const token = JSON.parse(regRes.body).data.token;

    // 3. Authenticate with Authorization Bearer
    const authRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(authRes.statusCode).toBe(200);
    expect(JSON.parse(authRes.body).data.user.email).toBe('eric@example.com');

    // 4. Authenticate with Cookie
    const cookieRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: {
        cookie: `syncforge_session=${token}`,
      },
    });
    expect(cookieRes.statusCode).toBe(200);
    expect(JSON.parse(cookieRes.body).data.user.name).toBe('Eric');
  });

  it('completes the single-use expiring password reset token flow', async () => {
    // Register
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'frank@example.com',
        password: 'InitialPassword123!',
        name: 'Frank',
      },
    });

    // Request reset token
    const requestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'frank@example.com' },
    });
    expect(requestRes.statusCode).toBe(200);
    const rawResetToken = JSON.parse(requestRes.body).data.resetToken;
    expect(rawResetToken).toBeDefined();

    // Confirm password reset with new password
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: {
        token: rawResetToken,
        newPassword: 'BrandNewPassword456!',
      },
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(JSON.parse(confirmRes.body).data.success).toBe(true);

    // Old password should fail
    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'frank@example.com',
        password: 'InitialPassword123!',
      },
    });
    expect(oldLogin.statusCode).toBe(500);

    // New password should succeed
    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: 'frank@example.com',
        password: 'BrandNewPassword456!',
      },
    });
    expect(newLogin.statusCode).toBe(200);

    // Reusing the same reset token must be rejected
    const reuseRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: {
        token: rawResetToken,
        newPassword: 'AnotherPassword789!',
      },
    });
    expect(reuseRes.statusCode).toBe(500);
    expect(reuseRes.body).toContain('already been used');
  });
});
