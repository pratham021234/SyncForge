import * as Y from 'yjs';
import { encodeAwarenessUpdate } from 'y-protocols/awareness';
import { WebSocket as NodeWebSocket } from 'ws';
import {
  RoomIdSchema,
  ClientMessage,
  ServerMessageSchema,
  ServerMessage,
  bytesToBase64,
  base64ToBytes,
  SYNCFORGE_PROTOCOL_VERSION,
} from '@syncforge/shared';
import {
  ConnectionState,
  ConnectionStateListener,
  SyncForgeClientOptions,
  JoinRoomOptions,
  UnsubscribeFn,
  ClientEvent,
} from './types.js';
import {
  ConnectionError,
  RoomError,
  SyncForgeError,
  AuthenticationError,
  AuthorizationError,
  ConfigurationError,
} from './errors.js';
import { SyncForgeRoom, RoomTransport } from './room.js';

// Resolve universal WebSocket implementation
function resolveWebSocketConstructor(customWs?: unknown): typeof WebSocket {
  if (customWs && typeof customWs === 'function') {
    return customWs as typeof WebSocket;
  }
  if (typeof WebSocket !== 'undefined') {
    return WebSocket;
  }
  const globalScope = globalThis as unknown as { WebSocket?: typeof WebSocket };
  if (typeof globalScope.WebSocket !== 'undefined') {
    return globalScope.WebSocket;
  }

  return NodeWebSocket as unknown as typeof WebSocket;
}

export class SyncForgeClient implements RoomTransport {
  private readonly options: Required<
    Omit<
      SyncForgeClientOptions,
      'serverUrl' | 'endpoint' | 'token' | 'apiKey' | 'getToken' | 'webSocket'
    >
  > & {
    serverUrl: string;
    token?: string;
    apiKey?: string;
    getToken?: () => Promise<string> | string;
    webSocket?: unknown;
  };

  private currentState: ConnectionState = 'disconnected';
  private stateListeners = new Set<ConnectionStateListener>();
  private errorListeners = new Set<(err: Error) => void>();
  private connectedListeners = new Set<() => void>();
  private disconnectedListeners = new Set<() => void>();

  private socket: WebSocket | null = null;
  private rooms = new Map<string, SyncForgeRoom>();
  private pendingJoinPromises = new Map<
    string,
    {
      resolve: (room: SyncForgeRoom) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private reconnectAttempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isIntentionallyDisconnected = false;
  private initPromise: Promise<void> | null = null;
  private readonly wsConstructor: typeof WebSocket;

  constructor(options: SyncForgeClientOptions) {
    const rawUrl = options.serverUrl || options.endpoint;
    if (!rawUrl) {
      throw new ConfigurationError(
        'serverUrl or endpoint is required to initialize SyncForgeClient',
      );
    }

    try {
      new URL(rawUrl);
    } catch {
      throw new ConfigurationError(`Invalid serverUrl/endpoint format: ${rawUrl}`);
    }

    this.options = {
      serverUrl: rawUrl,
      token: options.token ?? options.apiKey,
      apiKey: options.apiKey ?? options.token,
      getToken: options.getToken,
      clientId: options.clientId ?? `client_${Math.random().toString(36).slice(2, 10)}`,
      autoConnect: options.autoConnect ?? false,
      reconnectAttempts: options.reconnectAttempts ?? 10,
      reconnectDelayMs: options.reconnectDelayMs ?? 500,
      maxReconnectDelayMs: options.maxReconnectDelayMs ?? 10000,
      timeoutMs: options.timeoutMs ?? 10000,
      webSocket: options.webSocket,
    };

    this.wsConstructor = resolveWebSocketConstructor(options.webSocket);

    if (this.options.autoConnect) {
      void this.connect();
    }
  }

  public get connectionState(): ConnectionState {
    return this.currentState;
  }

  public get isConnected(): boolean {
    return this.currentState === 'connected';
  }

  public get serverUrl(): string {
    return this.options.serverUrl;
  }

  public get endpoint(): string {
    return this.options.serverUrl;
  }

  public get clientId(): string {
    return this.options.clientId;
  }

  public onConnectionStateChange(listener: ConnectionStateListener): UnsubscribeFn {
    this.stateListeners.add(listener);
    listener(this.currentState);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public on(
    event: 'status' | 'stateChange',
    listener: (state: ConnectionState) => void,
  ): UnsubscribeFn;
  public on(event: 'connected' | 'disconnected', listener: () => void): UnsubscribeFn;
  public on(event: 'error', listener: (err: Error) => void): UnsubscribeFn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(event: ClientEvent, listener: (...args: any[]) => void): UnsubscribeFn {
    switch (event) {
      case 'status':
      case 'stateChange': {
        const fn = listener as ConnectionStateListener;
        this.stateListeners.add(fn);
        fn(this.currentState);
        return () => this.stateListeners.delete(fn);
      }
      case 'connected': {
        const fn = listener as () => void;
        this.connectedListeners.add(fn);
        if (this.currentState === 'connected') {
          fn();
        }
        return () => this.connectedListeners.delete(fn);
      }
      case 'disconnected': {
        const fn = listener as () => void;
        this.disconnectedListeners.add(fn);
        if (this.currentState === 'disconnected' || this.currentState === 'failed') {
          fn();
        }
        return () => this.disconnectedListeners.delete(fn);
      }
      case 'error': {
        const fn = listener as (err: Error) => void;
        this.errorListeners.add(fn);
        return () => this.errorListeners.delete(fn);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public off(event: ClientEvent, listener: (...args: any[]) => void): void {
    switch (event) {
      case 'status':
      case 'stateChange':
        this.stateListeners.delete(listener as ConnectionStateListener);
        break;
      case 'connected':
        this.connectedListeners.delete(listener as () => void);
        break;
      case 'disconnected':
        this.disconnectedListeners.delete(listener as () => void);
        break;
      case 'error':
        this.errorListeners.delete(listener as (err: Error) => void);
        break;
    }
  }

  private emitError(err: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(err);
      } catch (e) {
        console.error('[SyncForgeClient] Error in error listener:', e);
      }
    }
  }

  protected setState(newState: ConnectionState): void {
    if (this.currentState === newState) return;
    this.currentState = newState;

    if (newState === 'connected') {
      for (const listener of this.connectedListeners) {
        try {
          listener();
        } catch (e) {
          console.error('[SyncForgeClient] Error in connected listener:', e);
        }
      }
    } else if (newState === 'disconnected' || newState === 'failed') {
      for (const listener of this.disconnectedListeners) {
        try {
          listener();
        } catch (e) {
          console.error('[SyncForgeClient] Error in disconnected listener:', e);
        }
      }
    }

    for (const listener of this.stateListeners) {
      try {
        listener(newState);
      } catch (err) {
        console.error('[SyncForgeClient] Error in connection state listener:', err);
      }
    }
  }

  private async resolveToken(): Promise<string> {
    if (this.options.getToken) {
      try {
        const token = await this.options.getToken();
        return token || '';
      } catch (err) {
        throw new AuthenticationError(
          `Failed to obtain token from getToken(): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return this.options.token || this.options.apiKey || '';
  }

  /**
   * Connects to the SyncForge WebSocket collaboration server.
   */
  public async connect(): Promise<void> {
    if (this.currentState === 'connected') return;
    if (this.initPromise) return this.initPromise;

    this.isIntentionallyDisconnected = false;
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    this.initPromise = (async () => {
      let resolved = false;
      const wsUrl = this.buildWebSocketUrl();

      // Resolve token dynamically before establishing connection
      let token = '';
      try {
        token = await this.resolveToken();
      } catch (err) {
        this.setState('failed');
        this.initPromise = null;
        const authErr = err instanceof Error ? err : new AuthenticationError(String(err));
        this.emitError(authErr);
        throw authErr;
      }

      return new Promise<void>((resolve, reject) => {
        let ws: WebSocket;
        try {
          ws = new this.wsConstructor(wsUrl);
        } catch (err) {
          this.setState('failed');
          this.initPromise = null;
          const connErr = new ConnectionError(
            `Failed to construct WebSocket for ${wsUrl}: ${err instanceof Error ? err.message : String(err)}`,
          );
          this.emitError(connErr);
          return reject(connErr);
        }

        const timeoutTimer = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.initPromise = null;
            try {
              ws.close();
            } catch {
              // ignore
            }
            this.setState('failed');
            const timeoutErr = new ConnectionError(
              `Connection attempt timed out after ${this.options.timeoutMs}ms`,
            );
            this.emitError(timeoutErr);
            reject(timeoutErr);
          }
        }, this.options.timeoutMs);

        ws.onopen = () => {
          this.socket = ws;
          // Send initial handshake message with resolved token
          this.sendRaw({
            type: 'init',
            protocolVersion: SYNCFORGE_PROTOCOL_VERSION,
            clientId: this.options.clientId,
            token,
          });
        };

        ws.onmessage = (event) => {
          const raw = typeof event.data === 'string' ? event.data : event.data.toString();
          this.handleMessage(raw, () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutTimer);
              this.reconnectAttempt = 0;
              this.setState('connected');
              this.initPromise = null;
              resolve();
            }
          });
        };

        ws.onclose = (event) => {
          clearTimeout(timeoutTimer);
          this.socket = null;
          this.initPromise = null;

          if (!resolved) {
            resolved = true;
            this.setState('failed');
            const closeErr = new ConnectionError(
              `WebSocket closed before completing handshake (code: ${event.code})`,
            );
            this.emitError(closeErr);
            reject(closeErr);
          } else {
            this.handleUnexpectedClose(event.code);
          }
        };

        ws.onerror = (_err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutTimer);
            this.initPromise = null;
            this.setState('failed');
            const err = new ConnectionError(`WebSocket connection error connecting to ${wsUrl}`);
            this.emitError(err);
            reject(err);
          }
        };
      });
    })();

    return this.initPromise;
  }

  /**
   * Joins a collaborative room and returns a SyncForgeRoom handle with real Y.Doc.
   */
  public async joinRoom(roomId: string, options?: JoinRoomOptions): Promise<SyncForgeRoom> {
    const parsed = RoomIdSchema.safeParse(roomId);
    if (!parsed.success) {
      const err = new RoomError(
        `Invalid roomId: ${parsed.error.issues.map((i) => i.message).join(', ')}`,
        'INVALID_ROOM_ID',
      );
      this.emitError(err);
      throw err;
    }

    const validRoomId = parsed.data;

    // Return existing room if already joined and active
    const existing = this.rooms.get(validRoomId);
    if (existing && existing.isJoined) {
      return existing;
    }

    if (this.currentState !== 'connected') {
      await this.connect();
    }

    const room = existing ?? new SyncForgeRoom(validRoomId, this);
    this.rooms.set(validRoomId, room);
    room.setStatus('connecting');

    const timeoutDuration = options?.timeoutMs ?? this.options.timeoutMs;

    return new Promise<SyncForgeRoom>((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = this.pendingJoinPromises.get(validRoomId);
        if (pending) {
          this.pendingJoinPromises.delete(validRoomId);
          room.setStatus('failed');
          const err = new RoomError(`Timeout waiting to join room ${validRoomId}`);
          this.emitError(err);
          reject(err);
        }
      }, timeoutDuration);

      this.pendingJoinPromises.set(validRoomId, { resolve, reject, timer });

      const stateVector = Y.encodeStateVector(room.doc);
      this.sendRaw({
        type: 'join_room',
        roomId: validRoomId,
        stateVector: bytesToBase64(stateVector),
      });
    });
  }

  /**
   * Gets an existing room session by ID if currently open.
   */
  public getRoom(roomId: string): SyncForgeRoom | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Returns all currently active room sessions managed by this client.
   */
  public getActiveRooms(): SyncForgeRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Leaves and cleans up a room session.
   */
  public async leaveRoom(roomId: string): Promise<void> {
    const pending = this.pendingJoinPromises.get(roomId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingJoinPromises.delete(roomId);
      pending.reject(new RoomError(`Room ${roomId} was left before join completed`));
    }

    const room = this.rooms.get(roomId);
    if (room) {
      await room.leave();
    }
    this.rooms.delete(roomId);
  }

  /**
   * Internal message handler
   */
  private handleMessage(rawJson: string, onHandshakeSuccess?: () => void): void {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawJson);
    } catch {
      console.warn('[SyncForgeClient] Received malformed message:', rawJson);
      return;
    }

    const parseResult = ServerMessageSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      console.warn('[SyncForgeClient] Unrecognized server message:', parseResult.error.message);
      return;
    }

    const message: ServerMessage = parseResult.data;

    switch (message.type) {
      case 'init_ack': {
        if (onHandshakeSuccess) {
          onHandshakeSuccess();
        }
        // Resubscribe active rooms after reconnect
        this.resubscribeActiveRooms();
        break;
      }

      case 'room_joined': {
        const room = this.rooms.get(message.roomId);
        if (room) {
          room.setStatus('syncing');
          if (message.serverStateVector) {
            // Send local diff to server
            const serverVector = base64ToBytes(message.serverStateVector);
            const localDiff = Y.encodeStateAsUpdate(room.doc, serverVector);
            if (localDiff.length > 0) {
              this.sendSyncStep2(message.roomId, localDiff);
            }
          }

          // Transmit initial local awareness state if present
          const awUpdate = encodeAwarenessUpdate(room.awareness, [room.awareness.clientID]);
          if (awUpdate.length > 0) {
            this.sendAwareness(message.roomId, awUpdate);
          }
        }

        const pending = this.pendingJoinPromises.get(message.roomId);
        if (pending && room) {
          clearTimeout(pending.timer);
          this.pendingJoinPromises.delete(message.roomId);
          pending.resolve(room);
        }
        break;
      }

      case 'room_rejected': {
        const room = this.rooms.get(message.roomId);
        let error: SyncForgeError;
        if (message.code === 'UNAUTHENTICATED' || message.code === 'TOKEN_EXPIRED') {
          error = new AuthenticationError(message.reason);
        } else if (message.code === 'UNAUTHORIZED') {
          error = new AuthorizationError(message.reason);
        } else {
          error = new RoomError(message.reason, message.code);
        }

        if (room) {
          room.setStatus('failed');
          room.emitError(error);
        }

        this.emitError(error);

        const pending = this.pendingJoinPromises.get(message.roomId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingJoinPromises.delete(message.roomId);
          pending.reject(error);
        }
        break;
      }

      case 'sync_step2': {
        const room = this.rooms.get(message.roomId);
        if (room) {
          const updateBytes = base64ToBytes(message.update);
          room.handleSyncStep2(updateBytes);
        }
        break;
      }

      case 'doc_update': {
        const room = this.rooms.get(message.roomId);
        if (room) {
          const updateBytes = base64ToBytes(message.update);
          room.handleRemoteUpdate(updateBytes);
        }
        break;
      }

      case 'awareness': {
        const room = this.rooms.get(message.roomId);
        if (room) {
          const updateBytes = base64ToBytes(message.awarenessUpdate);
          room.handleRemoteAwareness(updateBytes);
        }
        break;
      }

      case 'error': {
        let err: SyncForgeError;
        if (message.code === 'UNAUTHENTICATED' || message.code === 'TOKEN_EXPIRED') {
          err = new AuthenticationError(message.message);
          this.setState('failed');
        } else if (message.code === 'UNAUTHORIZED') {
          err = new AuthorizationError(message.message);
        } else {
          err = new SyncForgeError(message.message, message.code);
        }
        this.emitError(err);
        break;
      }

      case 'server_shutdown': {
        this.handleUnexpectedClose(1001, message.reconnectDelayMs);
        break;
      }
    }
  }

  private resubscribeActiveRooms(): void {
    for (const [roomId, room] of this.rooms) {
      room.setStatus('syncing');
      const stateVector = Y.encodeStateVector(room.doc);
      this.sendRaw({
        type: 'join_room',
        roomId,
        stateVector: bytesToBase64(stateVector),
      });
    }
  }

  private handleUnexpectedClose(code: number, delayOverride?: number): void {
    if (this.isIntentionallyDisconnected) {
      this.setState('disconnected');
      return;
    }

    // Permanent auth/forbidden closures should not retry indefinitely
    if (code === 4001 || code === 4003) {
      this.setState('failed');
      const authErr = new AuthenticationError(
        `Connection closed due to authentication failure (${code})`,
      );
      this.emitError(authErr);
      return;
    }

    for (const room of this.rooms.values()) {
      room.setStatus('disconnected');
    }

    if (this.reconnectAttempt >= this.options.reconnectAttempts) {
      this.setState('failed');
      const maxRetriesErr = new ConnectionError(
        `Failed to reconnect after ${this.reconnectAttempt} attempts`,
      );
      this.emitError(maxRetriesErr);
      return;
    }

    this.setState('reconnecting');
    this.reconnectAttempt++;

    const baseDelay = delayOverride ?? this.options.reconnectDelayMs;
    const expDelay = Math.min(
      baseDelay * Math.pow(1.5, this.reconnectAttempt - 1),
      this.options.maxReconnectDelayMs,
    );
    const jitter = Math.random() * 200;
    const finalDelay = expDelay + jitter;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      void this.connect().catch((_err) => {
        // Error will trigger another reconnect cycle
      });
    }, finalDelay);
  }

  public sendDocUpdate(roomId: string, update: Uint8Array): void {
    this.sendRaw({
      type: 'doc_update',
      roomId,
      update: bytesToBase64(update),
    });
  }

  public sendSyncStep1(roomId: string, stateVector: Uint8Array): void {
    this.sendRaw({
      type: 'sync_step1',
      roomId,
      stateVector: bytesToBase64(stateVector),
    });
  }

  public sendSyncStep2(roomId: string, update: Uint8Array): void {
    this.sendRaw({
      type: 'sync_step2',
      roomId,
      update: bytesToBase64(update),
    });
  }

  public sendLeaveRoom(roomId: string): void {
    this.rooms.delete(roomId);
    this.sendRaw({
      type: 'leave_room',
      roomId,
    });
  }

  public sendAwareness(roomId: string, awarenessUpdate: Uint8Array): void {
    this.sendRaw({
      type: 'awareness',
      roomId,
      awarenessUpdate: bytesToBase64(awarenessUpdate),
    });
  }

  private sendRaw(message: ClientMessage): void {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(message));
    }
  }

  private buildWebSocketUrl(): string {
    const raw = this.options.serverUrl;
    const parsed = new URL(raw);
    const protocol = parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 'wss:' : 'ws:';
    parsed.protocol = protocol;
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/ws/collaborate';
    }
    return parsed.toString();
  }

  /**
   * Explicit client-initiated disconnection. Disables automatic reconnection.
   */
  public async disconnect(): Promise<void> {
    this.isIntentionallyDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Cancel all pending join promises
    for (const [roomId, pending] of this.pendingJoinPromises) {
      clearTimeout(pending.timer);
      pending.reject(new ConnectionError(`Connection closed while joining room ${roomId}`));
    }
    this.pendingJoinPromises.clear();

    if (this.socket) {
      try {
        this.socket.close(1000, 'Client disconnected');
      } catch {
        // ignore
      }
      this.socket = null;
    }

    for (const room of this.rooms.values()) {
      room.setStatus('disconnected');
    }

    this.setState('disconnected');
  }

  public destroy(): void {
    void this.disconnect();
    this.stateListeners.clear();
    this.errorListeners.clear();
    this.connectedListeners.clear();
    this.disconnectedListeners.clear();
    for (const room of this.rooms.values()) {
      room.destroy();
    }
    this.rooms.clear();
  }
}

export function createSyncForgeClient(options: SyncForgeClientOptions): SyncForgeClient {
  return new SyncForgeClient(options);
}
