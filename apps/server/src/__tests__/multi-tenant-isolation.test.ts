import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { InMemoryUserRepository } from '../infrastructure/repositories/user.repository.js';
import { InMemoryOrganizationRepository } from '../infrastructure/repositories/organization.repository.js';
import { InMemoryProjectRepository } from '../infrastructure/repositories/project.repository.js';
import { InMemoryApiKeyRepository } from '../infrastructure/repositories/api-key.repository.js';
import { InMemoryAuditRepository } from '../infrastructure/repositories/audit.repository.js';
import { AuthManagerService } from '../services/auth-manager.service.js';
import { OrganizationService } from '../services/organization.service.js';
import { ProjectService } from '../services/project.service.js';
import { ApiKeyService } from '../services/api-key.service.js';

describe('Multi-Tenant Data Isolation & Role-Based Access Control', () => {
  let app: FastifyInstance;
  let userRepo: InMemoryUserRepository;
  let orgRepo: InMemoryOrganizationRepository;
  let projectRepo: InMemoryProjectRepository;
  let apiKeyRepo: InMemoryApiKeyRepository;
  let auditRepo: InMemoryAuditRepository;

  let authManagerService: AuthManagerService;
  let orgService: OrganizationService;
  let projectService: ProjectService;
  let apiKeyService: ApiKeyService;

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
    orgService = new OrganizationService(orgRepo, userRepo, auditRepo);
    projectService = new ProjectService(projectRepo, orgRepo, apiKeyRepo, auditRepo);
    apiKeyService = new ApiKeyService(apiKeyRepo, projectRepo, orgRepo, auditRepo);

    app = buildApp({
      authManagerService,
      organizationService: orgService,
      projectService,
      apiKeyService,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('prevents cross-tenant access to organizations and projects', async () => {
    // 1. Register Alice
    const regAlice = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'alice@alpha.com', password: 'Password123!', name: 'Alice' },
    });
    const aliceData = JSON.parse(regAlice.body).data;
    const aliceToken = aliceData.token;
    const aliceOrgId = aliceData.organization.id;
    const aliceProjectId = aliceData.project.id;

    // 2. Register Bob
    const regBob = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'bob@beta.com', password: 'Password123!', name: 'Bob' },
    });
    const bobToken = JSON.parse(regBob.body).data.token;

    // 3. Bob attempts to read Alice's organization
    const bobReadOrg = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${aliceOrgId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobReadOrg.statusCode).toBe(500); // Handled authorization error
    expect(bobReadOrg.body).toContain('Unauthorized: You do not have access to this organization');

    // 4. Bob attempts to list Alice's projects
    const bobListProjects = await app.inject({
      method: 'GET',
      url: `/api/v1/projects?organizationId=${aliceOrgId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobListProjects.statusCode).toBe(500);
    expect(bobListProjects.body).toContain(
      'Unauthorized: You do not have access to this organization',
    );

    // 5. Bob attempts to get Alice's project directly
    const bobGetProject = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${aliceProjectId}`,
      headers: { authorization: `Bearer ${bobToken}` },
    });
    expect(bobGetProject.statusCode).toBe(500);
    expect(bobGetProject.body).toContain('Unauthorized: You do not have access to this project');

    // 6. Alice can read her own organization and projects
    const aliceReadOrg = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${aliceOrgId}`,
      headers: { authorization: `Bearer ${aliceToken}` },
    });
    expect(aliceReadOrg.statusCode).toBe(200);
    expect(JSON.parse(aliceReadOrg.body).data.organization.name).toBe("Alice's Workspace");
  });

  it('enforces organization role permissions: viewer cannot generate API keys', async () => {
    // 1. Register Owner (Charlie)
    const regOwner = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'charlie@owner.com', password: 'Password123!', name: 'Charlie' },
    });
    const ownerData = JSON.parse(regOwner.body).data;
    const ownerToken = ownerData.token;
    const orgId = ownerData.organization.id;
    const projectId = ownerData.project.id;

    // 2. Register Viewer (Dave)
    const regViewer = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'dave@viewer.com', password: 'Password123!', name: 'Dave' },
    });
    const viewerToken = JSON.parse(regViewer.body).data.token;

    // 3. Charlie invites Dave as 'viewer'
    const inviteRes = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${orgId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { email: 'dave@viewer.com', role: 'viewer' },
    });
    expect(inviteRes.statusCode).toBe(201);

    // 4. Dave (viewer) attempts to generate an API key for the project
    const genKeyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/keys`,
      headers: { authorization: `Bearer ${viewerToken}` },
      payload: { name: 'Unauthorized Viewer Key' },
    });
    expect(genKeyRes.statusCode).toBe(500);
    expect(genKeyRes.body).toContain(
      'Only organization owners and admins can generate API credentials',
    );

    // 5. Charlie (owner) generates an API key successfully
    const ownerGenKey = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/keys`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Owner Production Key' },
    });
    expect(ownerGenKey.statusCode).toBe(201);
    expect(JSON.parse(ownerGenKey.body).data.secretKey).toBeDefined();
  });

  it('enforces API key project scoping: Project A key cannot mint tokens for Project B', async () => {
    // 1. Setup Project A
    const regA = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'userA@test.com', password: 'Password123!', name: 'User A' },
    });
    const dataA = JSON.parse(regA.body).data;
    const keyA = dataA.initialApiKey;
    const projectAId = dataA.project.id;

    // 2. Setup Project B
    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'userB@test.com', password: 'Password123!', name: 'User B' },
    });
    const dataB = JSON.parse(regB.body).data;
    const projectBId = dataB.project.id;

    // 3. Key A attempts to mint token for Project B -> Forbidden
    const crossMintRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectBId}/tokens/room`,
      headers: { 'x-api-key': keyA },
      payload: { roomId: 'secret-room-b' },
    });
    expect(crossMintRes.statusCode).toBe(403);
    expect(crossMintRes.body).toContain('API key is not authorized for this project');

    // 4. Key A mints token for Project A -> Success
    const validMintRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectAId}/tokens/room`,
      headers: { 'x-api-key': keyA },
      payload: { roomId: 'shared-room-a' },
    });
    expect(validMintRes.statusCode).toBe(200);
    const minted = JSON.parse(validMintRes.body).data;
    expect(minted.token).toBeDefined();
    expect(minted.projectId).toBe(projectAId);
    expect(minted.roomId).toBe('shared-room-a');
  });

  it('revoking an API key immediately invalidates subsequent operations', async () => {
    // 1. Setup project and get initial key
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'admin@keys.com', password: 'Password123!', name: 'Admin' },
    });
    const data = JSON.parse(reg.body).data;
    const token = data.token;
    const projectId = data.project.id;
    const rawKey = data.initialApiKey;

    // List keys to get key ID
    const listRes = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}/keys`,
      headers: { authorization: `Bearer ${token}` },
    });
    const keys = JSON.parse(listRes.body).data.apiKeys;
    const keyId = keys[0].id;

    // Key works before revocation
    const beforeRevoke = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tokens/room`,
      headers: { 'x-api-key': rawKey },
      payload: { roomId: 'test-room' },
    });
    expect(beforeRevoke.statusCode).toBe(200);

    // Revoke key
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/keys/${keyId}/revoke`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    // Key must fail after revocation
    const afterRevoke = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/tokens/room`,
      headers: { 'x-api-key': rawKey },
      payload: { roomId: 'test-room' },
    });
    expect(afterRevoke.statusCode).toBe(401);
    expect(afterRevoke.body).toContain('API key has been revoked');
  });
});
