import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { RoomManager } from '../engine/room-manager.js';
import { PersistenceService, InMemoryPersistenceStore } from '../services/persistence.service.js';

describe('Package Consumption & External Integration Verification', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let persistenceService: PersistenceService;
  let roomManager: RoomManager;

  beforeAll(async () => {
    const persistenceStore = new InMemoryPersistenceStore();
    persistenceService = new PersistenceService(persistenceStore);
    roomManager = new RoomManager(persistenceService);

    app = buildApp({
      persistenceService,
      roomManager,
    });

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    serverUrl = address;
  });

  afterAll(async () => {
    if (roomManager) {
      await roomManager.shutdown();
    }
    await app.close();
  });

  describe('Package Build & Exports Verification', () => {
    const sdkDistPath = path.resolve(__dirname, '../../../../packages/sdk/dist');

    it('has generated all essential standalone bundle entrypoints', () => {
      expect(fs.existsSync(path.join(sdkDistPath, 'index.js'))).toBe(true);
      expect(fs.existsSync(path.join(sdkDistPath, 'index.cjs'))).toBe(true);
      expect(fs.existsSync(path.join(sdkDistPath, 'index.d.ts'))).toBe(true);
      expect(fs.existsSync(path.join(sdkDistPath, 'react/index.js'))).toBe(true);
      expect(fs.existsSync(path.join(sdkDistPath, 'react/index.d.ts'))).toBe(true);
    });

    it('exports the documented public API from the built module', async () => {
      const sdkModule = await import(/* @vite-ignore */ path.join(sdkDistPath, 'index.js'));

      expect(sdkModule.SyncForgeClient).toBeDefined();
      expect(sdkModule.createSyncForgeClient).toBeDefined();
      expect(sdkModule.SyncForgeRoom).toBeDefined();
      expect(sdkModule.SyncForgeCanvasAdapter).toBeDefined();
      expect(sdkModule.SyncForgeError).toBeDefined();
      expect(sdkModule.ConnectionError).toBeDefined();
      expect(sdkModule.AuthenticationError).toBeDefined();
      expect(sdkModule.AuthorizationError).toBeDefined();
      expect(sdkModule.ConfigurationError).toBeDefined();
      expect(sdkModule.RoomError).toBeDefined();
      expect(sdkModule.RoomIdSchema).toBeDefined();
      expect(sdkModule.UserPresenceSchema).toBeDefined();
    });

    it('exports React hooks and provider from the built react subpath', async () => {
      const reactModule = await import(/* @vite-ignore */ path.join(sdkDistPath, 'react/index.js'));

      expect(reactModule.SyncForgeProvider).toBeDefined();
      expect(reactModule.useSyncForgeClient).toBeDefined();
      expect(reactModule.useSyncForgeRoom).toBeDefined();
      expect(reactModule.useSyncForgePresence).toBeDefined();
      expect(reactModule.useSyncForgeStatus).toBeDefined();
    });
  });

  describe('Real Server Collaboration via External Consumer Entrypoint', () => {
    it('executes two-client synchronization against live collaboration backend', async () => {
      // Import the built SDK directly as an external consumer would
      const sdkDistPath = path.resolve(__dirname, '../../../../packages/sdk/dist/index.js');
      const { SyncForgeClient } = (await import(
        /* @vite-ignore */ sdkDistPath
      )) as typeof import('@syncforge/sdk');

      // Client A
      const clientA = new SyncForgeClient({
        endpoint: serverUrl,
        clientId: 'ext_client_alice',
        getToken: async () => 'dev-token-project-1',
        autoConnect: true,
      });

      // Client B
      const clientB = new SyncForgeClient({
        endpoint: serverUrl,
        clientId: 'ext_client_bob',
        getToken: async () => 'dev-token-project-1',
        autoConnect: true,
      });

      const testRoomId = 'pkg-test-room-42';
      const [roomA, roomB] = await Promise.all([
        clientA.joinRoom(testRoomId),
        clientB.joinRoom(testRoomId),
      ]);

      expect(['syncing', 'synced']).toContain(roomA.status);
      expect(['syncing', 'synced']).toContain(roomB.status);

      // Wait for both to be fully synced
      await Promise.all([
        new Promise<void>((resolve) => {
          if (roomA.isSynced) resolve();
          else roomA.on('synced', resolve);
        }),
        new Promise<void>((resolve) => {
          if (roomB.isSynced) resolve();
          else roomB.on('synced', resolve);
        }),
      ]);

      expect(roomA.isSynced).toBe(true);
      expect(roomB.isSynced).toBe(true);

      // Mutate shared data from client A
      const mapA = roomA.document.getMap('test_shared_map');
      const mapB = roomB.document.getMap('test_shared_map');

      mapA.set('greeting', 'Hello from external client A!');

      // Verify propagation to client B
      await new Promise<void>((resolve) => {
        if (mapB.get('greeting') === 'Hello from external client A!') {
          resolve();
        } else {
          mapB.observe(() => {
            if (mapB.get('greeting') === 'Hello from external client A!') {
              resolve();
            }
          });
        }
      });

      expect(mapB.get('greeting')).toBe('Hello from external client A!');

      // Mutate from client B and verify propagation to client A
      mapB.set('reply', 'Acknowledged from client B!');

      await new Promise<void>((resolve) => {
        if (mapA.get('reply') === 'Acknowledged from client B!') {
          resolve();
        } else {
          mapA.observe(() => {
            if (mapA.get('reply') === 'Acknowledged from client B!') {
              resolve();
            }
          });
        }
      });

      expect(mapA.get('reply')).toBe('Acknowledged from client B!');

      // Clean teardown
      await Promise.all([roomA.leave(), roomB.leave()]);
      await Promise.all([clientA.disconnect(), clientB.disconnect()]);

      expect(clientA.connectionState).toBe('disconnected');
      expect(clientB.connectionState).toBe('disconnected');
    });
  });
});
