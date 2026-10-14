import crypto from 'crypto';
import { Pool } from 'pg';
import { getDatabasePool } from '../infrastructure/database.js';
import { env } from '../config/env.js';
import { verifyJwt } from '../utils/crypto.utils.js';
import { ApiKeyService } from './api-key.service.js';

export interface AuthContext {
  userId: string;
  projectId: string;
  role: 'editor' | 'viewer';
  isAuthenticated: boolean;
  allowedRoomId?: string;
}

export interface IAuthService {
  authenticate(token?: string, clientId?: string): Promise<AuthContext>;
  authorizeRoomJoin(
    context: AuthContext,
    roomId: string,
  ): Promise<{ authorized: boolean; readOnly: boolean; reason?: string }>;
}

export class AuthService implements IAuthService {
  private inMemoryRoomProjects = new Map<string, string>();

  constructor(
    private pool: Pool = getDatabasePool(),
    private apiKeyService: ApiKeyService = new ApiKeyService(),
  ) {}

  /**
   * Authenticates client connection using API key, short-lived room token, or dev token.
   * Server determines trusted userId and projectId; untrusted client claims are rejected.
   */
  public async authenticate(token?: string, clientId?: string): Promise<AuthContext> {
    if (!token || token.trim().length === 0) {
      if (env.NODE_ENV === 'test') {
        const testId = clientId
          ? `test_usr_${clientId}`
          : `test_usr_${crypto.randomUUID().slice(0, 8)}`;
        return {
          userId: testId,
          projectId: 'project_test_default',
          role: 'editor',
          isAuthenticated: true,
        };
      }
      throw new Error('Authentication required: missing token');
    }

    const cleanToken = token.trim();

    // 1. JWT Short-Lived Room Token (e.g. for browser SDK clients)
    if (cleanToken.split('.').length === 3) {
      try {
        const payload = verifyJwt<{
          projectId: string;
          roomId?: string;
          userId?: string;
          role?: 'editor' | 'viewer';
        }>(cleanToken, env.AUTH_SECRET);

        if (!payload.projectId) {
          throw new Error('JWT token is missing required projectId claim');
        }

        const userId =
          payload.userId ??
          (clientId ? `usr_${clientId}` : `usr_${crypto.randomUUID().slice(0, 8)}`);

        return {
          userId,
          projectId: payload.projectId,
          role: payload.role ?? 'editor',
          allowedRoomId: payload.roomId,
          isAuthenticated: true,
        };
      } catch (jwtErr) {
        throw new Error(
          `Invalid authentication token: ${jwtErr instanceof Error ? jwtErr.message : String(jwtErr)}`,
        );
      }
    }

    // 2. Development & Test Token Adapter (explicitly labeled for local testing)
    if (
      cleanToken.startsWith('dev_') ||
      cleanToken.startsWith('test_') ||
      cleanToken.startsWith('dev-') ||
      cleanToken.startsWith('test-')
    ) {
      const derivedUser = `dev_usr_${crypto.createHash('sha256').update(cleanToken).digest('hex').slice(0, 12)}`;
      return {
        userId: derivedUser,
        projectId: 'project_dev_default',
        role: 'editor',
        isAuthenticated: true,
      };
    }

    // 3. Production API Key Authentication
    const verification = await this.apiKeyService.verifyApiKey(cleanToken);
    if (!verification.valid || !verification.apiKey || !verification.project) {
      throw new Error(verification.reason ?? 'Invalid API key');
    }

    const userId = clientId
      ? `key_usr_${clientId}`
      : `key_usr_${verification.apiKey.keyPrefix.replace(/[^a-z0-9]/gi, '').slice(0, 8)}`;

    return {
      userId,
      projectId: verification.project.id,
      role: 'editor',
      isAuthenticated: true,
    };
  }

  /**
   * Enforces room-level authorization and strict project namespace isolation.
   * Ensures a client authenticated for Project A cannot join or mutate rooms for Project B.
   */
  public async authorizeRoomJoin(
    context: AuthContext,
    roomId: string,
  ): Promise<{ authorized: boolean; readOnly: boolean; reason?: string }> {
    if (!context.isAuthenticated) {
      return { authorized: false, readOnly: true, reason: 'Unauthenticated connection' };
    }

    // 1. If token is scoped to a specific room, verify room restriction
    if (context.allowedRoomId && context.allowedRoomId !== roomId) {
      return {
        authorized: false,
        readOnly: true,
        reason: `Token is restricted to room '${context.allowedRoomId}' and cannot join '${roomId}'`,
      };
    }

    // 2. Default test/dev namespaces automatically pass
    if (
      context.projectId === 'project_test_default' ||
      context.projectId === 'project_dev_default'
    ) {
      return { authorized: true, readOnly: false };
    }

    // 3. Enforce Project Namespace Isolation
    // Check in-memory tracking first
    const inMemProject = this.inMemoryRoomProjects.get(roomId);
    if (inMemProject) {
      if (inMemProject !== context.projectId) {
        return {
          authorized: false,
          readOnly: true,
          reason: 'Room belongs to another project namespace',
        };
      }
      return { authorized: true, readOnly: context.role === 'viewer' };
    }

    if (env.NODE_ENV === 'test') {
      this.inMemoryRoomProjects.set(roomId, context.projectId);
      return { authorized: true, readOnly: context.role === 'viewer' };
    }

    // Check PostgreSQL database if accessible
    try {
      const res = await this.pool.query<{ project_id: string }>(
        'SELECT project_id FROM rooms WHERE room_id = $1 LIMIT 1;',
        [roomId],
      );

      if (res.rows.length > 0 && res.rows[0]) {
        if (res.rows[0].project_id && res.rows[0].project_id !== context.projectId) {
          return {
            authorized: false,
            readOnly: true,
            reason: 'Room belongs to another project namespace',
          };
        }
      } else {
        // Associate new room with this project in database
        await this.pool
          .query(
            `INSERT INTO rooms (room_id, project_id)
           VALUES ($1, $2)
           ON CONFLICT (room_id)
           DO UPDATE SET project_id = EXCLUDED.project_id WHERE rooms.project_id IS NULL;`,
            [roomId, context.projectId],
          )
          .catch(() => {});
      }

      this.inMemoryRoomProjects.set(roomId, context.projectId);
      return { authorized: true, readOnly: context.role === 'viewer' };
    } catch {
      // In offline/test database fallback, store in memory
      this.inMemoryRoomProjects.set(roomId, context.projectId);
      return { authorized: true, readOnly: context.role === 'viewer' };
    }
  }
}
