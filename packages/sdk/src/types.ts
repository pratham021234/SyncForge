import * as Y from 'yjs';
import { RoomId, UserPresence } from '@syncforge/shared';

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'error';

export type RoomStatus = 'disconnected' | 'connecting' | 'syncing' | 'synced' | 'failed' | 'error';

export interface SyncForgeClientOptions {
  /**
   * Primary server URL (e.g. 'http://localhost:4000', 'ws://localhost:4000/ws/collaborate')
   */
  serverUrl?: string;
  /**
   * Ergonomic synonym for `serverUrl`
   */
  endpoint?: string;
  /**
   * Static authentication token (JWT or development token)
   */
  token?: string;
  /**
   * Static API key or service token
   */
  apiKey?: string;
  /**
   * Dynamic token retrieval callback for refreshing or fetching tokens asynchronously
   */
  getToken?: () => Promise<string> | string;
  /**
   * Unique client identifier. Defaults to auto-generated ID.
   */
  clientId?: string;
  /**
   * Whether to automatically connect upon client creation. Default: false.
   */
  autoConnect?: boolean;
  /**
   * Maximum reconnection attempts before entering 'failed' state. Default: 10.
   */
  reconnectAttempts?: number;
  /**
   * Base reconnection delay in milliseconds. Default: 500ms.
   */
  reconnectDelayMs?: number;
  /**
   * Maximum exponential backoff delay in milliseconds. Default: 10,000ms.
   */
  maxReconnectDelayMs?: number;
  /**
   * Connection and room join timeout in milliseconds. Default: 10,000ms.
   */
  timeoutMs?: number;
  /**
   * Optional custom WebSocket constructor (for Node.js or test environments)
   */
  webSocket?: unknown;
}

export interface JoinRoomOptions {
  readOnly?: boolean;
  timeoutMs?: number;
}

export type ConnectionStateListener = (state: ConnectionState) => void;
export type RoomStatusListener = (status: RoomStatus) => void;
export type PresenceListener = (peers: UserPresence[]) => void;
export type UnsubscribeFn = () => void;

export type ClientEvent = 'status' | 'stateChange' | 'connected' | 'disconnected' | 'error';
export type RoomEvent = 'status' | 'synced' | 'presence' | 'error';

export interface RoomSession {
  readonly roomId: RoomId;
  readonly doc: Y.Doc;
  readonly document: Y.Doc;
  readonly status: RoomStatus;
  readonly isJoined: boolean;
  readonly isSynced: boolean;
  onStatusChange(listener: RoomStatusListener): UnsubscribeFn;
  onPresenceChange(listener: PresenceListener): UnsubscribeFn;
  on(event: 'status', listener: (status: RoomStatus) => void): UnsubscribeFn;
  on(event: 'synced', listener: () => void): UnsubscribeFn;
  on(event: 'presence', listener: (peers: UserPresence[]) => void): UnsubscribeFn;
  on(event: 'error', listener: (err: Error) => void): UnsubscribeFn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  off(event: RoomEvent, listener: (...args: any[]) => void): void;

  getPresence(): UserPresence[];
  leave(): Promise<void>;
  updatePresence(presence: Partial<UserPresence>): void;
}
