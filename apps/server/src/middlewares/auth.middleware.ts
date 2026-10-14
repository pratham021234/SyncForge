import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthManagerService, UserSessionPayload } from '../services/auth-manager.service.js';
import { AppError } from '../errors/app-error.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserSessionPayload;
  }
}

export function createAuthHook(authManagerService: AuthManagerService) {
  return async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    let token: string | undefined;

    // 1. Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }

    // 2. Check Cookie
    if (!token && request.headers.cookie) {
      const match = request.headers.cookie
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('syncforge_session='));
      if (match) {
        token = match.slice('syncforge_session='.length).trim();
      }
    }

    if (!token) {
      throw new AppError('Authentication required: missing session token', 401, 'UNAUTHORIZED');
    }

    try {
      const session = authManagerService.verifySessionToken(token);
      request.user = session;
    } catch (err) {
      throw new AppError(
        `Session expired or invalid: ${err instanceof Error ? err.message : String(err)}`,
        401,
        'UNAUTHORIZED',
      );
    }
  };
}
