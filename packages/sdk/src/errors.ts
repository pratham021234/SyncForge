import { SyncForgeErrorCode } from '@syncforge/shared';

/**
 * Base error class for all SyncForge SDK runtime errors.
 */
export class SyncForgeError extends Error {
  public readonly code: SyncForgeErrorCode | string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: SyncForgeErrorCode | string = 'INTERNAL_ERROR',
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'SyncForgeError';
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when network transport or WebSocket connection fails.
 */
export class ConnectionError extends SyncForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ConnectionError';
  }
}

/**
 * Thrown when client authentication or authorization fails.
 */
export class AuthenticationError extends SyncForgeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when room operations fail (e.g. invalid room ID, room full).
 */
export class RoomError extends SyncForgeError {
  constructor(
    message: string,
    code: SyncForgeErrorCode = 'ROOM_NOT_FOUND',
    details?: Record<string, unknown>,
  ) {
    super(message, code, details);
    this.name = 'RoomError';
  }
}
