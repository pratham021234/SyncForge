import { RoomId, UserPresence } from '@syncforge/shared';

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface SyncForgeClientOptions {
  serverUrl: string;
  apiKey?: string;
  authToken?: string;
  autoConnect?: boolean;
  reconnectAttempts?: number;
  reconnectDelayMs?: number;
  timeoutMs?: number;
}

export type ConnectionStateListener = (state: ConnectionState) => void;
export type PresenceListener = (peers: UserPresence[]) => void;
export type UnsubscribeFn = () => void;

export interface RoomSession {
  readonly roomId: RoomId;
  readonly isJoined: boolean;
  leave(): Promise<void>;
  updatePresence(presence: Partial<UserPresence>): void;
}
