/**
 * SyncForge Protocol Constants
 * Core constants shared between the server, SDK, and client applications.
 */

export const SYNCFORGE_PROTOCOL_VERSION = '1.0.0';

export const ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{3,64}$/;

export const MAX_ROOM_ID_LENGTH = 64;
export const MIN_ROOM_ID_LENGTH = 3;

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 60000;

/**
 * WebSocket Close Codes standardizing disconnection reasons
 */
export const SYNCFORGE_WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  UNAUTHORIZED: 4001,
  ROOM_NOT_FOUND: 4004,
  ROOM_FULL: 4005,
  RATE_LIMITED: 4029,
  SERVER_SHUTDOWN: 4030,
} as const;

export type SyncForgeWsCloseCode =
  (typeof SYNCFORGE_WS_CLOSE_CODES)[keyof typeof SYNCFORGE_WS_CLOSE_CODES];
