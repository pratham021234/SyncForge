/**
 * SyncForge Error Codes and Shared Error Definitions
 */

export const SYNCFORGE_ERROR_CODES = {
  // Authentication & Authorization (4000 series)
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_API_KEY: 'INVALID_API_KEY',

  // Validation & Protocol (4100 series)
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_ROOM_ID: 'INVALID_ROOM_ID',
  PROTOCOL_VERSION_MISMATCH: 'PROTOCOL_VERSION_MISMATCH',
  UNSUPPORTED_MESSAGE_TYPE: 'UNSUPPORTED_MESSAGE_TYPE',

  // Room & Resource Lifecycle (4200 series)
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_ALREADY_EXISTS: 'ROOM_ALREADY_EXISTS',
  ROOM_CAPACITY_EXCEEDED: 'ROOM_CAPACITY_EXCEEDED',

  // Rate Limiting (4300 series)
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server & Persistence (5000 series)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  PERSISTENCE_FAILURE: 'PERSISTENCE_FAILURE',
} as const;

export type SyncForgeErrorCode = (typeof SYNCFORGE_ERROR_CODES)[keyof typeof SYNCFORGE_ERROR_CODES];

export interface SerializedSyncForgeError {
  code: SyncForgeErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
