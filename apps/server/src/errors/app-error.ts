import { SYNCFORGE_ERROR_CODES, SyncForgeErrorCode } from '@syncforge/shared';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: SyncForgeErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode = 500,
    code: SyncForgeErrorCode = SYNCFORGE_ERROR_CODES.INTERNAL_ERROR,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, SYNCFORGE_ERROR_CODES.INVALID_PAYLOAD, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 404, SYNCFORGE_ERROR_CODES.ROOM_NOT_FOUND, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: Record<string, unknown>) {
    super(message, 401, SYNCFORGE_ERROR_CODES.UNAUTHENTICATED, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', details?: Record<string, unknown>) {
    super(message, 503, SYNCFORGE_ERROR_CODES.SERVICE_UNAVAILABLE, details);
  }
}
