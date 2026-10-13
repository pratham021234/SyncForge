import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { SyncForgeRoom, RoomTransport } from '../room.js';

describe('SyncForgeRoom', () => {
  const createMockTransport = (): RoomTransport => ({
    sendDocUpdate: vi.fn(),
    sendSyncStep1: vi.fn(),
    sendSyncStep2: vi.fn(),
    sendLeaveRoom: vi.fn(),
    sendAwareness: vi.fn(),
  });

  it('should broadcast local edits via transport', () => {
    const mockTransport = createMockTransport();
    const room = new SyncForgeRoom('test-room', mockTransport);
    const text = room.doc.getText('test');

    // Local edit
    text.insert(0, 'Hello local edit');

    expect(mockTransport.sendDocUpdate).toHaveBeenCalledWith('test-room', expect.any(Uint8Array));
    room.destroy();
  });

  it('should not echo remote updates back to transport', () => {
    const mockTransport = createMockTransport();
    const room = new SyncForgeRoom('test-room', mockTransport);

    // Create a remote update
    const remoteDoc = new Y.Doc();
    remoteDoc.getText('test').insert(0, 'Remote edit');
    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc);

    // Apply remote update to room
    room.handleRemoteUpdate(remoteUpdate);

    // Document must reflect remote edit
    expect(room.doc.getText('test').toString()).toBe('Remote edit');

    // Transport should NOT have been called with an echo update!
    expect(mockTransport.sendDocUpdate).not.toHaveBeenCalled();

    room.destroy();
  });

  it('should update status on sync_step2 and transition to synced', () => {
    const mockTransport = createMockTransport();
    const room = new SyncForgeRoom('test-room', mockTransport);
    expect(room.status).toBe('connecting');

    const statusUpdates: string[] = [];
    room.onStatusChange((s) => statusUpdates.push(s));

    const serverDoc = new Y.Doc();
    serverDoc.getText('test').insert(0, 'Initial sync state');
    const update = Y.encodeStateAsUpdate(serverDoc);

    room.handleSyncStep2(update);

    expect(room.status).toBe('synced');
    expect(room.doc.getText('test').toString()).toBe('Initial sync state');
    expect(statusUpdates).toContain('synced');

    room.destroy();
  });

  it('should broadcast awareness updates and track presence', () => {
    const mockTransport = createMockTransport();
    const room = new SyncForgeRoom('test-room', mockTransport);

    const presenceHistory: unknown[] = [];
    room.onPresenceChange((peers) => presenceHistory.push(peers));

    // Update presence
    room.updatePresence({
      userName: 'Alice Developer',
      color: '#10b981',
      cursor: { x: 150, y: 300 },
    });

    expect(mockTransport.sendAwareness).toHaveBeenCalledWith('test-room', expect.any(Uint8Array));

    const presence = room.getPresence();
    expect(presence.length).toBe(1);
    expect(presence[0]?.userName).toBe('Alice Developer');
    expect(presence[0]?.color).toBe('#10b981');
    expect(presence[0]?.cursor).toEqual({ x: 150, y: 300 });

    room.destroy();
  });
});
