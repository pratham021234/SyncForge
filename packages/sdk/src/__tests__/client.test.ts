import { describe, it, expect, vi } from 'vitest';
import { SyncForgeClient, SyncForgeError, RoomError, ConnectionError } from '../index.js';

describe('SyncForgeClient initialization', () => {
  it('should initialize with valid server URL', () => {
    const client = new SyncForgeClient({ serverUrl: 'http://localhost:4000' });
    expect(client.serverUrl).toBe('http://localhost:4000');
    expect(client.connectionState).toBe('disconnected');
  });

  it('should reject invalid server URL format', () => {
    expect(() => new SyncForgeClient({ serverUrl: 'not-a-valid-url' })).toThrowError(
      SyncForgeError,
    );
  });

  it('should notify state listeners when state changes', () => {
    const client = new SyncForgeClient({ serverUrl: 'http://localhost:4000' });
    const listener = vi.fn();
    const unsubscribe = client.onConnectionStateChange(listener);

    expect(listener).toHaveBeenCalledWith('disconnected');

    unsubscribe();
    client.destroy();
  });

  it('should reject joining rooms when not connected', async () => {
    const client = new SyncForgeClient({ serverUrl: 'http://localhost:4000' });
    await expect(client.joinRoom('valid-room')).rejects.toThrowError(ConnectionError);
  });

  it('should reject invalid roomId format when attempting to join', async () => {
    const client = new SyncForgeClient({ serverUrl: 'http://localhost:4000' });
    await expect(client.joinRoom('bad room with spaces!')).rejects.toThrowError(RoomError);
  });
});
