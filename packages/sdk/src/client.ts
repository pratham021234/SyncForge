import { RoomIdSchema } from '@syncforge/shared';
import {
  ConnectionState,
  ConnectionStateListener,
  RoomSession,
  SyncForgeClientOptions,
  UnsubscribeFn,
} from './types.js';
import { ConnectionError, RoomError, SyncForgeError } from './errors.js';

/**
 * SyncForgeClient
 * The primary entry point for developers integrating SyncForge collaboration into their applications.
 */
export class SyncForgeClient {
  private readonly options: Required<SyncForgeClientOptions>;
  private currentState: ConnectionState = 'disconnected';
  private stateListeners = new Set<ConnectionStateListener>();

  constructor(options: SyncForgeClientOptions) {
    if (!options.serverUrl) {
      throw new SyncForgeError(
        'serverUrl is required to initialize SyncForgeClient',
        'INVALID_PAYLOAD',
      );
    }

    try {
      new URL(options.serverUrl);
    } catch {
      throw new SyncForgeError(`Invalid serverUrl format: ${options.serverUrl}`, 'INVALID_PAYLOAD');
    }

    this.options = {
      serverUrl: options.serverUrl,
      apiKey: options.apiKey ?? '',
      authToken: options.authToken ?? '',
      autoConnect: options.autoConnect ?? false,
      reconnectAttempts: options.reconnectAttempts ?? 5,
      reconnectDelayMs: options.reconnectDelayMs ?? 1000,
      timeoutMs: options.timeoutMs ?? 10000,
    };
  }

  public get connectionState(): ConnectionState {
    return this.currentState;
  }

  public get serverUrl(): string {
    return this.options.serverUrl;
  }

  public onConnectionStateChange(listener: ConnectionStateListener): UnsubscribeFn {
    this.stateListeners.add(listener);
    // Notify listener immediately of current state
    listener(this.currentState);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  protected setState(newState: ConnectionState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;
    for (const listener of this.stateListeners) {
      try {
        listener(newState);
      } catch (err) {
        // Prevent subscriber error from breaking state dispatcher
        console.error('Error in SyncForge connection state listener:', err);
      }
    }
  }

  /**
   * Connect to the SyncForge server.
   * Full WebSocket CRDT synchronization is scheduled for Phase 1.
   */
  public async connect(): Promise<void> {
    if (this.currentState === 'connected' || this.currentState === 'connecting') {
      return;
    }

    this.setState('connecting');

    // Foundation verification check: ensure server endpoint responds to health probes
    try {
      const url = new URL('/healthz', this.options.serverUrl).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.options.timeoutMs) });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      this.setState('connected');
    } catch (err) {
      this.setState('error');
      throw new ConnectionError(
        `Failed to connect to SyncForge server at ${this.options.serverUrl}: ${err instanceof Error ? err.message : String(err)}`,
        { originalError: err },
      );
    }
  }

  /**
   * Disconnect from server and clean up resources.
   */
  public async disconnect(): Promise<void> {
    this.setState('disconnected');
  }

  /**
   * Join a room. Full real-time document synchronization is wired in Phase 1.
   */
  public async joinRoom(roomId: string): Promise<RoomSession> {
    const parsedRoom = RoomIdSchema.safeParse(roomId);
    if (!parsedRoom.success) {
      throw new RoomError(
        `Invalid roomId: ${parsedRoom.error.issues.map((i) => i.message).join(', ')}`,
        'INVALID_ROOM_ID',
      );
    }

    if (this.currentState !== 'connected') {
      throw new ConnectionError('Cannot join room while client is not connected to server');
    }

    const validRoomId = parsedRoom.data;

    return {
      roomId: validRoomId,
      isJoined: true,
      leave: async () => {
        // Cleanup handled in Phase 1
      },
      updatePresence: () => {
        // Presence updates handled in Phase 2
      },
    };
  }

  public destroy(): void {
    this.stateListeners.clear();
    this.setState('disconnected');
  }
}
