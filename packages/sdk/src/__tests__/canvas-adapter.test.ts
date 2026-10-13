import { describe, it, expect, vi } from 'vitest';
import { SyncForgeRoom, RoomTransport } from '../room.js';
import { SyncForgeCanvasAdapter } from '../canvas-adapter.js';
import { createDefaultCanvasNode, createDefaultCanvasEdge } from '@syncforge/shared';

describe('SyncForgeCanvasAdapter', () => {
  const createMockTransport = (): RoomTransport => ({
    sendDocUpdate: vi.fn(),
    sendSyncStep1: vi.fn(),
    sendSyncStep2: vi.fn(),
    sendLeaveRoom: vi.fn(),
    sendAwareness: vi.fn(),
  });

  it('synchronizes nodes and edges with Yjs maps', () => {
    const transport = createMockTransport();
    const room = new SyncForgeRoom('room-canvas-test', transport);
    const adapter = new SyncForgeCanvasAdapter(room);

    let state = adapter.getGraphState();
    expect(state.nodes.length).toBe(0);
    expect(state.edges.length).toBe(0);

    const node1 = createDefaultCanvasNode('note', { x: 50, y: 100 }, { title: 'First Note' });
    adapter.addNode(node1);

    state = adapter.getGraphState();
    expect(state.nodes.length).toBe(1);
    expect(state.nodes[0]?.data.title).toBe('First Note');

    const node2 = createDefaultCanvasNode('process', { x: 250, y: 100 });
    adapter.addNode(node2);

    const edge = createDefaultCanvasEdge(node1.id, node2.id, { label: 'Connects' });
    adapter.addEdge(edge);

    expect(adapter.getNodes().length).toBe(2);
    expect(adapter.getEdges().length).toBe(1);

    // Deleting node1 cascades and removes connected edge
    adapter.deleteNode(node1.id);
    expect(adapter.getNodes().length).toBe(1);
    expect(adapter.getEdges().length).toBe(0);

    adapter.destroy();
    room.destroy();
  });

  it('supports undo and redo for local edits without affecting remote updates', () => {
    const transport = createMockTransport();
    const room = new SyncForgeRoom('room-undo-test', transport);
    const adapter = new SyncForgeCanvasAdapter(room);

    expect(adapter.canUndo()).toBe(false);
    expect(adapter.canRedo()).toBe(false);

    // 1. Local user adds a node
    const nodeA = createDefaultCanvasNode('note', { x: 10, y: 10 }, { title: 'Local Node A' });
    adapter.addNode(nodeA);

    expect(adapter.getNodes().length).toBe(1);
    expect(adapter.canUndo()).toBe(true);

    // 2. Undo local addition
    adapter.undo();
    expect(adapter.getNodes().length).toBe(0);
    expect(adapter.canRedo()).toBe(true);

    // 3. Redo
    adapter.redo();
    expect(adapter.getNodes().length).toBe(1);

    // 4. Remote peer adds a node via Yjs transaction
    room.doc.transact(() => {
      const remoteNode = createDefaultCanvasNode(
        'process',
        { x: 500, y: 500 },
        { title: 'Remote Peer Node' },
      );
      room.doc.getMap('canvas_nodes').set(remoteNode.id, remoteNode);
    }, 'remote');

    expect(adapter.getNodes().length).toBe(2);

    // 5. Local undo should only undo local Node A, NOT the remote peer node!
    adapter.undo();
    const remainingNodes = adapter.getNodes();
    expect(remainingNodes.length).toBe(1);
    expect(remainingNodes[0]?.data.title).toBe('Remote Peer Node');

    adapter.destroy();
    room.destroy();
  });
});
