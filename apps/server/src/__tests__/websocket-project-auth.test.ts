import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { buildApp } from '../app.js';
import { InMemoryOrganizationRepository } from '../infrastructure/repositories/organization.repository.js';
import { InMemoryProjectRepository } from '../infrastructure/repositories/project.repository.js';
import { InMemoryApiKeyRepository } from '../infrastructure/repositories/api-key.repository.js';
import { InMemoryUsageRepository } from '../infrastructure/repositories/usage.repository.js';
import { InMemoryAuditRepository } from '../infrastructure/repositories/audit.repository.js';
import { ApiKeyService } from '../services/api-key.service.js';
import { AuthService } from '../services/auth.service.js';
import { UsageService } from '../services/usage.service.js';
import { signJwt } from '../utils/crypto.utils.js';
import { env } from '../config/env.js';

import { PersistenceService, InMemoryPersistenceStore } from '../services/persistence.service.js';
import { RoomManager } from '../engine/room-manager.js';

type TestMessage = Record<string, unknown>;

describe('WebSocket Project Scoping & Cross-Project Isolation', () => {
  let app: FastifyInstance;
  let serverPort: number;

  let apiKeyRepo: InMemoryApiKeyRepository;
  let projectRepo: InMemoryProjectRepository;
  let orgRepo: InMemoryOrganizationRepository;
  let usageRepo: InMemoryUsageRepository;
  let auditRepo: InMemoryAuditRepository;

  let apiKeyService: ApiKeyService;
  let authService: AuthService;
  let usageService: UsageService;
  let persistenceService: PersistenceService;
  let roomManager: RoomManager;

  let projectAId: string;
  let projectBId: string;

  beforeEach(async () => {
    orgRepo = new InMemoryOrganizationRepository();
    projectRepo = new InMemoryProjectRepository();
    apiKeyRepo = new InMemoryApiKeyRepository();
    usageRepo = new InMemoryUsageRepository();
    auditRepo = new InMemoryAuditRepository();

    persistenceService = new PersistenceService(new InMemoryPersistenceStore());
    roomManager = new RoomManager(persistenceService);

    apiKeyService = new ApiKeyService(apiKeyRepo, projectRepo, orgRepo, auditRepo);
    authService = new AuthService(undefined, apiKeyService);
    usageService = new UsageService(usageRepo, projectRepo, orgRepo);

    // Create 2 separate tenant projects
    const orgA = await orgRepo.create({ name: 'Org A', slug: 'org-a' }, 'user_a');
    const projectA = await projectRepo.create({
      organizationId: orgA.id,
      name: 'Project A',
      slug: 'proj-a',
    });
    projectAId = projectA.id;

    const orgB = await orgRepo.create({ name: 'Org B', slug: 'org-b' }, 'user_b');
    const projectB = await projectRepo.create({
      organizationId: orgB.id,
      name: 'Project B',
      slug: 'proj-b',
    });
    projectBId = projectB.id;

    app = buildApp({
      persistenceService,
      roomManager,
      authService,
      apiKeyService,
      usageService,
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to bind server');
    serverPort = address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  function connectClient(token: string): Promise<{
    ws: WebSocket;
    initAck: TestMessage;
    sendJson: (msg: TestMessage) => void;
    waitForMessage: (type: string, timeoutMs?: number) => Promise<TestMessage>;
  }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/ws/collaborate`);
      const messageQueue: TestMessage[] = [];
      const waiters: Array<{ type: string; resolve: (val: TestMessage) => void }> = [];

      ws.on('message', (data) => {
        const parsed = JSON.parse(data.toString()) as TestMessage;
        const waiterIndex = waiters.findIndex((w) => w.type === parsed.type);
        if (waiterIndex !== -1) {
          const waiter = waiters.splice(waiterIndex, 1)[0];
          waiter?.resolve(parsed);
        } else {
          messageQueue.push(parsed);
        }
      });

      ws.on('close', (code, reason) => {
        const text = reason.toString();
        for (const waiter of waiters) {
          waiter.resolve({ type: 'closed', code, reason: text });
        }
      });

      const sendJson = (msg: TestMessage) => ws.send(JSON.stringify(msg));

      const waitForMessage = (type: string, timeoutMs = 5000): Promise<TestMessage> => {
        const queuedIndex = messageQueue.findIndex((m) => m.type === type);
        if (queuedIndex !== -1) {
          const item = messageQueue.splice(queuedIndex, 1)[0];
          return Promise.resolve(item ?? {});
        }
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            rej(new Error(`Timed out waiting for message of type '${type}'`));
          }, timeoutMs);
          waiters.push({
            type,
            resolve: (val) => {
              clearTimeout(timer);
              res(val);
            },
          });
        });
      };

      ws.on('open', async () => {
        sendJson({
          type: 'init',
          protocolVersion: '1.0.0',
          token,
          clientId: 'test_client',
        });
        try {
          const initAck = await waitForMessage('init_ack');
          resolve({ ws, initAck, sendJson, waitForMessage });
        } catch (err) {
          reject(err);
        }
      });

      ws.on('error', reject);
    });
  }

  it('connects with a project room token, joins authorized room, and rejects cross-project room access', async () => {
    // 1. First client initializes Room X under Project A
    const tokenA = signJwt(
      { projectId: projectAId, userId: 'usr_alice', role: 'editor' },
      env.AUTH_SECRET,
      3600,
    );
    const clientA = await connectClient(tokenA);

    clientA.sendJson({ type: 'join_room', roomId: 'room-project-a-private' });
    const joinARes = await clientA.waitForMessage('room_joined');
    expect(joinARes.roomId).toBe('room-project-a-private');

    // 2. Client B initializes with Project B token
    const tokenB = signJwt(
      { projectId: projectBId, userId: 'usr_bob', role: 'editor' },
      env.AUTH_SECRET,
      3600,
    );
    const clientB = await connectClient(tokenB);

    // 3. Client B attempts to join Project A's private room -> REJECTED
    clientB.sendJson({ type: 'join_room', roomId: 'room-project-a-private' });
    const rejectRes = await clientB.waitForMessage('room_rejected');

    expect(rejectRes.roomId).toBe('room-project-a-private');
    expect(rejectRes.code).toBe('UNAUTHORIZED');
    expect(rejectRes.reason).toBe('Room belongs to another project namespace');

    // 4. Client B joins its own room -> SUCCESS
    clientB.sendJson({ type: 'join_room', roomId: 'room-project-b-own' });
    const joinBRes = await clientB.waitForMessage('room_joined');
    expect(joinBRes.roomId).toBe('room-project-b-own');

    clientA.ws.close();
    clientB.ws.close();
  });

  it('rejects access when token is scoped to a specific room and client attempts to join a different room', async () => {
    // Mint token explicitly restricted to 'room-canvas-only'
    const restrictedToken = signJwt(
      {
        projectId: projectAId,
        roomId: 'room-canvas-only',
        userId: 'usr_charlie',
        role: 'editor',
      },
      env.AUTH_SECRET,
      3600,
    );

    const client = await connectClient(restrictedToken);

    // Attempt to join an unauthorized room
    client.sendJson({ type: 'join_room', roomId: 'room-unauthorized-target' });
    const rejectMsg = await client.waitForMessage('room_rejected');

    expect(rejectMsg.roomId).toBe('room-unauthorized-target');
    expect(rejectMsg.code).toBe('UNAUTHORIZED');
    expect(rejectMsg.reason).toContain("Token is restricted to room 'room-canvas-only'");

    // Join authorized room -> SUCCESS
    client.sendJson({ type: 'join_room', roomId: 'room-canvas-only' });
    const joinMsg = await client.waitForMessage('room_joined');
    expect(joinMsg.roomId).toBe('room-canvas-only');

    client.ws.close();
  });
});
