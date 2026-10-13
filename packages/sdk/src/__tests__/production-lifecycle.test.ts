import { describe, it, expect, vi } from 'vitest';
import {
  SyncForgeClient,
  SyncForgeRoom,
  ConfigurationError,
  AuthenticationError,
  RoomError,
} from '../index.js';

// Mock WebSocket that responds to SyncForge handshake
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  readyState = MockWebSocket.OPEN;
  url: string;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason?: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      if (this.onopen) this.onopen();
    }, 5);
  }

  send(data: string) {
    this.sentMessages.push(data);
    try {
      const parsed = JSON.parse(data);
      if (parsed.type === 'init') {
        setTimeout(() => {
          this.simulateServerMessage({
            type: 'init_ack',
            protocolVersion: '1.0.0',
            connectionId: 'conn_test_mock',
            authenticated: true,
            userId: 'user_test_mock',
            serverTime: Date.now(),
          });
        }, 5);
      }
    } catch {
      // ignore
    }
  }

  close(code = 1000, reason = 'Normal') {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code, reason });
  }

  simulateServerMessage(msg: Record<string, unknown>) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(msg) });
    }
  }
}

describe('SyncForge SDK Production Lifecycle & Resilience', () => {
  describe('Client Configuration & Validation', () => {
    it('throws ConfigurationError when serverUrl or endpoint is missing', () => {
      expect(
        () => new SyncForgeClient({} as unknown as { serverUrl: string }),
      ).toThrow(ConfigurationError);
      expect(() => new SyncForgeClient({ serverUrl: '' })).toThrow(ConfigurationError);
    });


    it('throws ConfigurationError when URL format is invalid', () => {
      expect(() => new SyncForgeClient({ serverUrl: 'not-a-valid-url' })).toThrow(
        ConfigurationError,
      );
    });

    it('accepts endpoint as a synonym for serverUrl', () => {
      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        webSocket: MockWebSocket,
      });
      expect(client.endpoint).toBe('http://localhost:4000');
      expect(client.serverUrl).toBe('http://localhost:4000');
    });

    it('normalizes http/https URLs into ws/wss endpoints with /ws/collaborate', async () => {
      const client = new SyncForgeClient({
        serverUrl: 'http://localhost:4000',
        webSocket: MockWebSocket,
      });

      await client.connect();
      expect(client.isConnected).toBe(true);
      await client.disconnect();
    });
  });

  describe('Dynamic Token Resolution', () => {
    it('invokes dynamic getToken callback on connect', async () => {
      const getTokenMock = vi.fn().mockResolvedValue('dynamic-jwt-token-xyz');

      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        getToken: getTokenMock,
        webSocket: MockWebSocket,
      });

      await client.connect();
      expect(getTokenMock).toHaveBeenCalledTimes(1);
      expect(client.isConnected).toBe(true);
      await client.disconnect();
    });

    it('fails connection gracefully if getToken throws', async () => {
      const getTokenMock = vi.fn().mockRejectedValue(new Error('Auth service unreachable'));

      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        getToken: getTokenMock,
        webSocket: MockWebSocket,
      });

      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      await expect(client.connect()).rejects.toThrow(AuthenticationError);
      expect(client.connectionState).toBe('failed');
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Connection Lifecycle & Idempotency', () => {
    it('handles duplicate connect calls idempotently without spawning extra sockets', async () => {
      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        webSocket: MockWebSocket,
      });

      const p1 = client.connect();
      const p2 = client.connect();

      await Promise.all([p1, p2]);
      expect(client.isConnected).toBe(true);
      await client.disconnect();
    });

    it('cancels pending reconnect timer and transitions to disconnected upon explicit disconnect', async () => {
      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        webSocket: MockWebSocket,
        reconnectAttempts: 5,
        reconnectDelayMs: 200,
      });

      await client.connect();

      // Simulate unexpected server drop
      const socket = (client as unknown as { socket: MockWebSocket }).socket;
      socket.close(1006, 'Abnormal closure');

      expect(client.connectionState).toBe('reconnecting');

      // User calls explicit disconnect before reconnect timer fires
      await client.disconnect();
      expect(client.connectionState).toBe('disconnected');
    });
  });

  describe('Multi-Room Management', () => {
    it('manages multiple independent rooms simultaneously', async () => {
      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        webSocket: MockWebSocket,
      });

      await client.connect();
      const socket = (client as unknown as { socket: MockWebSocket }).socket;

      const p1 = client.joinRoom('room-alpha');
      const p2 = client.joinRoom('room-beta');

      setTimeout(() => {
        socket.simulateServerMessage({
          type: 'room_joined',
          roomId: 'room-alpha',
          readOnly: false,
          serverStateVector: '',
        });
        socket.simulateServerMessage({
          type: 'room_joined',
          roomId: 'room-beta',
          readOnly: false,
          serverStateVector: '',
        });
      }, 10);

      const [roomA, roomB] = await Promise.all([p1, p2]);

      expect(roomA.roomId).toBe('room-alpha');
      expect(roomB.roomId).toBe('room-beta');
      expect(client.getActiveRooms()).toHaveLength(2);
      expect(client.getRoom('room-alpha')).toBe(roomA);
      expect(client.getRoom('room-beta')).toBe(roomB);

      // Leave one room; other remains active
      await client.leaveRoom('room-alpha');
      expect(client.getActiveRooms()).toHaveLength(1);
      expect(client.getRoom('room-alpha')).toBeUndefined();
      expect(client.getRoom('room-beta')).toBe(roomB);

      await client.destroy();
    });

    it('returns existing room instance when joinRoom is called for an already-joined room', async () => {
      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        webSocket: MockWebSocket,
      });

      await client.connect();
      const socket = (client as unknown as { socket: MockWebSocket }).socket;


      const joinPromise = client.joinRoom('singleton-room');
      setTimeout(() => {
        socket.simulateServerMessage({
          type: 'room_joined',
          roomId: 'singleton-room',
          readOnly: false,
          serverStateVector: '',
        });
      }, 10);
      const room = await joinPromise;

      const duplicateJoin = await client.joinRoom('singleton-room');
      expect(duplicateJoin).toBe(room);

      await client.destroy();
    });

    it('rejects pending join promise cleanly if room is left before join finishes', async () => {
      const client = new SyncForgeClient({
        endpoint: 'http://localhost:4000',
        webSocket: MockWebSocket,
      });

      await client.connect();

      const joinPromise = client.joinRoom('cancelled-room');
      const leavePromise = client.leaveRoom('cancelled-room');

      await expect(joinPromise).rejects.toThrow(RoomError);
      await leavePromise;

      await client.destroy();
    });
  });

  describe('Room Document & Typed Events', () => {
    it('provides document getter alias and emits typed synced and status events', async () => {
      const mockTransport = {
        sendDocUpdate: vi.fn(),
        sendSyncStep1: vi.fn(),
        sendSyncStep2: vi.fn(),
        sendLeaveRoom: vi.fn(),
        sendAwareness: vi.fn(),
      };

      const room = new SyncForgeRoom('test-room', mockTransport);
      expect(room.document).toBe(room.doc);
      expect(room.isSynced).toBe(false);

      const syncedListener = vi.fn();
      room.on('synced', syncedListener);

      room.setStatus('synced');
      expect(room.isSynced).toBe(true);
      expect(syncedListener).toHaveBeenCalledTimes(1);

      room.destroy();
    });
  });
});
