import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { PersistenceService, InMemoryPersistenceStore } from '../services/persistence.service.js';
import { RoomManager } from '../engine/room-manager.js';
import { SyncForgeClient } from '@syncforge/sdk';

describe('Multi-Client Real-Time WebSocket Collaboration', () => {
  let app: FastifyInstance;
  let serverUrl: string;
  let persistenceStore: InMemoryPersistenceStore;
  let persistenceService: PersistenceService;
  let roomManager: RoomManager;

  beforeAll(async () => {
    persistenceStore = new InMemoryPersistenceStore();
    persistenceService = new PersistenceService(persistenceStore);
    roomManager = new RoomManager(persistenceService);

    app = buildApp({
      persistenceService,
      roomManager,
    });

    // Listen on dynamic ephemeral port
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    serverUrl = address;
  });

  afterAll(async () => {
    if (roomManager) {
      await roomManager.shutdown();
    }
    await app.close();
  });

  it('should synchronize edits between two clients in the same room', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      token: 'dev_test_token_A',
      clientId: 'client_A',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      token: 'dev_test_token_B',
      clientId: 'client_B',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('collab_room_01');
    const roomB = await clientB.joinRoom('collab_room_01');

    expect(roomA.isJoined).toBe(true);
    expect(roomB.isJoined).toBe(true);

    const textA = roomA.doc.getText('document');
    const textB = roomB.doc.getText('document');

    // 1. Client A inserts text
    textA.insert(0, 'Hello from Client A! ');

    // Wait for propagation over WebSocket
    await new Promise<void>((resolve) => {
      const check = () => {
        if (textB.toString().includes('Hello from Client A!')) {
          resolve();
        } else {
          setTimeout(check, 25);
        }
      };
      check();
    });

    expect(textB.toString()).toBe('Hello from Client A! ');

    // 2. Client B appends text
    textB.insert(textB.length, 'Reply from Client B.');

    await new Promise<void>((resolve) => {
      const check = () => {
        if (textA.toString().includes('Reply from Client B.')) {
          resolve();
        } else {
          setTimeout(check, 25);
        }
      };
      check();
    });

    expect(textA.toString()).toBe('Hello from Client A! Reply from Client B.');
    expect(textB.toString()).toBe(textA.toString());

    clientA.destroy();
    clientB.destroy();
  });

  it('should converge concurrent edits from both clients without lost updates', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      token: 'dev_token_user_1',
      clientId: 'user_1',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      token: 'dev_token_user_2',
      clientId: 'user_2',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('concurrent_room_01');
    const roomB = await clientB.joinRoom('concurrent_room_01');

    const textA = roomA.doc.getText('concurrent-text');
    const textB = roomB.doc.getText('concurrent-text');

    // Perform concurrent edits without waiting
    textA.insert(0, '[A_CONCURRENT]');
    textB.insert(0, '[B_CONCURRENT]');

    // Wait for both to converge
    await new Promise<void>((resolve) => {
      const check = () => {
        if (
          textA.toString().includes('[A_CONCURRENT]') &&
          textA.toString().includes('[B_CONCURRENT]') &&
          textA.toString() === textB.toString()
        ) {
          resolve();
        } else {
          setTimeout(check, 30);
        }
      };
      check();
    });

    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toContain('[A_CONCURRENT]');
    expect(textA.toString()).toContain('[B_CONCURRENT]');

    clientA.destroy();
    clientB.destroy();
  });

  it('should strictly isolate rooms: Room 1 edits never leak to Room 2', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      token: 'dev_token_A',
      clientId: 'client_A',
    });

    const clientC = new SyncForgeClient({
      serverUrl,
      token: 'dev_token_C',
      clientId: 'client_C',
    });

    await clientA.connect();
    await clientC.connect();

    const roomA = await clientA.joinRoom('secret_room_alpha');
    const roomC = await clientC.joinRoom('unrelated_room_beta');

    const textA = roomA.doc.getText('secret');
    const textC = roomC.doc.getText('secret');

    textA.insert(0, 'Confidential Room Alpha content');

    // Give time for any unexpected broadcast
    await new Promise((r) => setTimeout(r, 100));

    // Room C must remain empty
    expect(textC.toString()).toBe('');

    clientA.destroy();
    clientC.destroy();
  });

  it('should recover state on reconnection and resynchronize missed edits', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      token: 'dev_token_reconnect',
      clientId: 'client_reconnect',
      reconnectDelayMs: 50,
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      token: 'dev_token_observer',
      clientId: 'client_observer',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('reconnection_room');
    const roomB = await clientB.joinRoom('reconnection_room');

    const textA = roomA.doc.getText('shared');
    const textB = roomB.doc.getText('shared');

    textA.insert(0, 'Initial shared sentence. ');

    await new Promise<void>((resolve) => {
      const check = () => {
        if (textB.toString().includes('Initial shared sentence.')) resolve();
        else setTimeout(check, 25);
      };
      check();
    });

    // 1. Temporarily disconnect Client A
    await clientA.disconnect();
    expect(clientA.connectionState).toBe('disconnected');

    // 2. Client B makes edits while A is disconnected
    textB.insert(textB.length, 'Offline edit from B.');
    expect(textB.toString()).toBe('Initial shared sentence. Offline edit from B.');
    await new Promise((r) => setTimeout(r, 50));

    // 3. Client A reconnects
    await clientA.connect();
    expect(clientA.connectionState).toBe('connected');

    // Rejoin / resynchronize room
    await clientA.joinRoom('reconnection_room');

    // Client A must receive missed edits and converge
    await new Promise<void>((resolve) => {
      const check = () => {
        if (textA.toString().includes('Offline edit from B.')) resolve();
        else setTimeout(check, 25);
      };
      check();
    });

    expect(textA.toString()).toBe(textB.toString());

    clientA.destroy();
    clientB.destroy();
  });
});
