import { describe, it, expect, afterEach } from 'vitest';
import * as Y from 'yjs';
import { RoomManager } from '../engine/room-manager.js';
import { PersistenceService, InMemoryPersistenceStore } from '../services/persistence.service.js';
import { RoomConnection } from '../engine/room.js';
import { ServerMessage } from '@syncforge/shared';

describe('Room & RoomManager', () => {
  let persistenceService: PersistenceService;
  let roomManager: RoomManager;

  afterEach(async () => {
    if (roomManager) {
      await roomManager.shutdown();
    }
  });

  it('should deduplicate concurrent getOrCreateRoom requests for the same room', async () => {
    const store = new InMemoryPersistenceStore();
    persistenceService = new PersistenceService(store);
    roomManager = new RoomManager(persistenceService, { idleTimeoutMs: 1000 });

    // Request the same room simultaneously 10 times
    const promises = Array.from({ length: 10 }, () =>
      roomManager.getOrCreateRoom('concurrent-room-1'),
    );

    const rooms = await Promise.all(promises);

    // All promises must resolve to the EXACT SAME room instance
    const firstRoom = rooms[0]!;
    for (const room of rooms) {
      expect(room).toBe(firstRoom);
    }
    expect(roomManager.activeRoomCount).toBe(1);
  });

  it('should track connections and broadcast updates excluding the sender', async () => {
    const store = new InMemoryPersistenceStore();
    persistenceService = new PersistenceService(store);
    roomManager = new RoomManager(persistenceService);

    const room = await roomManager.getOrCreateRoom('broadcast-room');

    const receivedA: ServerMessage[] = [];
    const receivedB: ServerMessage[] = [];

    const connA: RoomConnection = {
      connectionId: 'conn-A',
      userId: 'user-A',
      readOnly: false,
      send: (msg) => receivedA.push(msg),
    };

    const connB: RoomConnection = {
      connectionId: 'conn-B',
      userId: 'user-B',
      readOnly: false,
      send: (msg) => receivedB.push(msg),
    };

    room.addConnection(connA);
    room.addConnection(connB);
    expect(room.connectionCount).toBe(2);

    // Create a local update from client A
    const localDoc = new Y.Doc();
    localDoc.getText('notes').insert(0, 'Hello from A');
    const update = Y.encodeStateAsUpdate(localDoc);

    // Apply update through Room
    await room.applyClientUpdate(update, 'conn-A', 'msg-1');

    // Peer B should have received doc_update
    expect(receivedB.some((m) => m.type === 'doc_update')).toBe(true);

    // Sender A should have received doc_update_ack, but NOT the broadcast doc_update
    expect(receivedA.some((m) => m.type === 'doc_update')).toBe(false);
    expect(receivedA.some((m) => m.type === 'doc_update_ack')).toBe(true);

    // Remove connection A
    room.removeConnection('conn-A');
    expect(room.connectionCount).toBe(1);
  });

  it('should evict idle rooms after timeout when connections reach zero', async () => {
    const store = new InMemoryPersistenceStore();
    persistenceService = new PersistenceService(store);
    roomManager = new RoomManager(persistenceService, {
      idleTimeoutMs: 50, // 50ms idle threshold
      cleanupIntervalMs: 20000, // large interval so background timer does not race
    });

    const room = await roomManager.getOrCreateRoom('eviction-room');
    expect(roomManager.activeRoomCount).toBe(1);

    // Wait past idle timeout
    await new Promise((r) => setTimeout(r, 80));

    // Run cleanup
    const evicted = roomManager.cleanupIdleRooms();
    expect(evicted).toBe(1);
    expect(roomManager.activeRoomCount).toBe(0);
    expect(room.isDestroyed).toBe(true);
  });
});
