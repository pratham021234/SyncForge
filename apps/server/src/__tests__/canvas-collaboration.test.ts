import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { PersistenceService, InMemoryPersistenceStore } from '../services/persistence.service.js';
import { RoomManager } from '../engine/room-manager.js';
import { SyncForgeClient, SyncForgeCanvasAdapter } from '@syncforge/sdk';
import { createDefaultCanvasNode, createDefaultCanvasEdge } from '@syncforge/shared';

describe('Multi-Client Collaborative Canvas Integration', () => {
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

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    serverUrl = address;
  });

  afterAll(async () => {
    if (roomManager) {
      await roomManager.shutdown();
    }
    await app.close();
  });

  it('synchronizes node additions, edits, and moves between two clients', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      clientId: 'canvas_user_alice',
      token: 'dev-token-project-1',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      clientId: 'canvas_user_bob',
      token: 'dev-token-project-1',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('canvas-room-sync-1');
    const roomB = await clientB.joinRoom('canvas-room-sync-1');

    const adapterA = new SyncForgeCanvasAdapter(roomA);
    const adapterB = new SyncForgeCanvasAdapter(roomB);

    // 1. Client A adds a note node
    const noteNode = createDefaultCanvasNode(
      'note',
      { x: 100, y: 150 },
      { id: 'node_note_1', title: 'Architecture Note', content: 'Use Yjs CRDTs' },
    );
    adapterA.addNode(noteNode);

    // Wait for propagation
    await new Promise((r) => setTimeout(r, 200));

    expect(adapterB.getNodes().length).toBe(1);
    expect(adapterB.getNodes()[0]?.id).toBe('node_note_1');
    expect(adapterB.getNodes()[0]?.data.title).toBe('Architecture Note');
    expect(adapterB.getNodes()[0]?.position).toEqual({ x: 100, y: 150 });

    // 2. Client B moves the node
    adapterB.moveNode('node_note_1', { x: 280, y: 320 });

    await new Promise((r) => setTimeout(r, 200));

    expect(adapterA.getNodes()[0]?.position).toEqual({ x: 280, y: 320 });

    // 3. Client A updates node content
    adapterA.updateNode('node_note_1', {
      data: {
        title: 'Updated Architecture Note',
        content: 'Yjs + Fastify WebSockets',
      },
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(adapterB.getNodes()[0]?.data.title).toBe('Updated Architecture Note');
    expect(adapterB.getNodes()[0]?.data.content).toBe('Yjs + Fastify WebSockets');

    // Clean up
    adapterA.destroy();
    adapterB.destroy();
    await roomA.leave();
    await roomB.leave();
    await clientA.disconnect();
    await clientB.disconnect();
  });

  it('synchronizes edge connections and cascade deletes connected edges on node deletion', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      clientId: 'canvas_user_carol',
      token: 'dev-token-project-1',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      clientId: 'canvas_user_dave',
      token: 'dev-token-project-1',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('canvas-room-edges-1');
    const roomB = await clientB.joinRoom('canvas-room-edges-1');

    const adapterA = new SyncForgeCanvasAdapter(roomA);
    const adapterB = new SyncForgeCanvasAdapter(roomB);

    // Add two nodes
    const node1 = createDefaultCanvasNode('process', { x: 50, y: 50 }, { id: 'proc_1' });
    const node2 = createDefaultCanvasNode('decision', { x: 250, y: 50 }, { id: 'dec_1' });
    adapterA.addNode(node1);
    adapterA.addNode(node2);

    // Client B connects them with an edge
    const edge = createDefaultCanvasEdge('proc_1', 'dec_1', {
      id: 'edge_proc_dec_1',
      label: 'Success Flow',
    });
    adapterB.addEdge(edge);

    await new Promise((r) => setTimeout(r, 200));

    expect(adapterA.getEdges().length).toBe(1);
    expect(adapterA.getEdges()[0]?.id).toBe('edge_proc_dec_1');
    expect(adapterA.getEdges()[0]?.label).toBe('Success Flow');

    // Client A deletes proc_1 node; edge must be cascade deleted
    adapterA.deleteNode('proc_1');

    await new Promise((r) => setTimeout(r, 200));

    expect(adapterB.getNodes().length).toBe(1);
    expect(adapterB.getEdges().length).toBe(0);

    adapterA.destroy();
    adapterB.destroy();
    await roomA.leave();
    await roomB.leave();
    await clientA.disconnect();
    await clientB.disconnect();
  });

  it('converges on concurrent edits from multiple peers without conflict', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      clientId: 'canvas_user_peer_a',
      token: 'dev-token-project-1',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      clientId: 'canvas_user_peer_b',
      token: 'dev-token-project-1',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('canvas-room-concurrent-1');
    const roomB = await clientB.joinRoom('canvas-room-concurrent-1');

    const adapterA = new SyncForgeCanvasAdapter(roomA);
    const adapterB = new SyncForgeCanvasAdapter(roomB);

    // Both peers add nodes concurrently
    const nodeA = createDefaultCanvasNode(
      'note',
      { x: 10, y: 10 },
      { id: 'node_from_a', title: 'A Node' },
    );
    const nodeB = createDefaultCanvasNode(
      'process',
      { x: 200, y: 200 },
      { id: 'node_from_b', title: 'B Node' },
    );

    adapterA.addNode(nodeA);
    adapterB.addNode(nodeB);

    // Wait for both updates to propagate and merge
    await new Promise((r) => setTimeout(r, 300));

    const nodesInA = adapterA.getNodes();
    const nodesInB = adapterB.getNodes();

    expect(nodesInA.length).toBe(2);
    expect(nodesInB.length).toBe(2);

    const idsInA = nodesInA.map((n) => n.id).sort();
    const idsInB = nodesInB.map((n) => n.id).sort();

    expect(idsInA).toEqual(['node_from_a', 'node_from_b']);
    expect(idsInB).toEqual(['node_from_a', 'node_from_b']);

    adapterA.destroy();
    adapterB.destroy();
    await roomA.leave();
    await roomB.leave();
    await clientA.disconnect();
    await clientB.disconnect();
  });

  it('broadcasts live presence and cursor awareness across room peers', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      clientId: 'user_alice_cursor',
      token: 'dev-token-project-1',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      clientId: 'user_bob_cursor',
      token: 'dev-token-project-1',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('canvas-room-presence-1');
    const roomB = await clientB.joinRoom('canvas-room-presence-1');

    // Client A sets presence
    roomA.updatePresence({
      userId: 'user_alice_cursor',
      userName: 'Alice Engineer',
      color: '#10b981',
      cursor: { x: 420, y: 180 },
    });

    // Wait for awareness broadcast
    await new Promise((r) => setTimeout(r, 200));

    const presenceOnB = roomB.getPresence();
    const aliceOnB = presenceOnB.find((p) => p.userId === 'user_alice_cursor');

    expect(aliceOnB).toBeDefined();
    expect(aliceOnB?.userName).toBe('Alice Engineer');
    expect(aliceOnB?.color).toBe('#10b981');
    expect(aliceOnB?.cursor).toEqual({ x: 420, y: 180 });

    // Client A leaves room; presence must clean up
    await roomA.leave();

    await new Promise((r) => setTimeout(r, 200));

    const updatedPresenceOnB = roomB.getPresence();
    const aliceStillOnB = updatedPresenceOnB.find(
      (p) => p.userId === 'user_alice_cursor' && p.cursor !== undefined,
    );
    expect(aliceStillOnB).toBeUndefined();

    await roomB.leave();
    await clientA.disconnect();
    await clientB.disconnect();
  });

  it('reconstitutes canvas state when a client disconnects and reconnects', async () => {
    const clientA = new SyncForgeClient({
      serverUrl,
      clientId: 'user_persistent_a',
      token: 'dev-token-project-1',
    });

    const clientB = new SyncForgeClient({
      serverUrl,
      clientId: 'user_reconnecting_b',
      token: 'dev-token-project-1',
    });

    await clientA.connect();
    await clientB.connect();

    const roomA = await clientA.joinRoom('canvas-room-reconnect-1');
    await clientB.joinRoom('canvas-room-reconnect-1');

    const adapterA = new SyncForgeCanvasAdapter(roomA);

    // Initial state
    adapterA.addNode(createDefaultCanvasNode('note', { x: 0, y: 0 }, { id: 'node_init_1' }));
    await new Promise((r) => setTimeout(r, 200));

    // Client B disconnects
    await clientB.disconnect();

    // Client A adds a node while B is offline
    adapterA.addNode(
      createDefaultCanvasNode('decision', { x: 150, y: 150 }, { id: 'node_offline_add' }),
    );
    await new Promise((r) => setTimeout(r, 200));

    // Client B reconnects to the server and room
    await clientB.connect();
    const roomBReconnected = await clientB.joinRoom('canvas-room-reconnect-1');
    const adapterBReconnected = new SyncForgeCanvasAdapter(roomBReconnected);

    await new Promise((r) => setTimeout(r, 300));

    const nodesB = adapterBReconnected.getNodes();
    expect(nodesB.length).toBe(2);
    expect(nodesB.map((n) => n.id).sort()).toEqual(['node_init_1', 'node_offline_add']);

    adapterA.destroy();
    adapterBReconnected.destroy();
    await roomA.leave();
    await roomBReconnected.leave();
    await clientA.disconnect();
    await clientB.disconnect();
  });
});
