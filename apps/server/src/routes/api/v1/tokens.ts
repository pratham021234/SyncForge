import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { ApiKeyService } from '../../../services/api-key.service.js';
import { signJwt } from '../../../utils/crypto.utils.js';
import { env } from '../../../config/env.js';

const MintRoomTokenSchema = z.object({
  roomId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_\-.:]+$/, {
      message:
        'Room identifier can only contain alphanumeric characters, hyphens, underscores, dots, or colons',
    }),
  userId: z.string().max(64).optional(),
  role: z.enum(['editor', 'viewer'] as const).default('editor'),
  expiresInSeconds: z.number().int().min(60).max(86400).default(3600), // Default 1 hour
});

export const tokenRoutes: FastifyPluginAsync<{ apiKeyService?: ApiKeyService }> = async (
  fastify,
  opts,
) => {
  const apiKeyService = opts.apiKeyService ?? new ApiKeyService();

  /**
   * Server-side short-lived room token issuance.
   * Authenticated using Project API Secret Key via 'x-api-key' header.
   */
  fastify.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/tokens/room',
    async (request, reply) => {
      const { projectId } = request.params;
      const apiKeyHeader = request.headers['x-api-key'];

      if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Missing required x-api-key header for token minting',
          },
        });
      }

      // 1. Verify API Key
      const keyVerification = await apiKeyService.verifyApiKey(apiKeyHeader);
      if (!keyVerification.valid || !keyVerification.apiKey || !keyVerification.project) {
        return reply.status(401).send({
          error: {
            code: 'UNAUTHORIZED',
            message: keyVerification.reason ?? 'Invalid API key',
          },
        });
      }

      // 2. Ensure API Key belongs to the requested project
      if (keyVerification.project.id !== projectId) {
        return reply.status(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'API key is not authorized for this project',
          },
        });
      }

      // 3. Validate Token Payload
      const parseResult = MintRoomTokenSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: parseResult.error.issues[0]?.message ?? 'Invalid room token request payload',
          },
        });
      }

      const { roomId, userId, role, expiresInSeconds } = parseResult.data;
      const resolvedUserId = userId ?? `usr_${Math.random().toString(36).slice(2, 10)}`;

      // 4. Sign Short-Lived Scoped Room Token
      const token = signJwt(
        {
          projectId,
          roomId,
          userId: resolvedUserId,
          role,
        },
        env.AUTH_SECRET,
        expiresInSeconds,
      );

      return reply.send({
        data: {
          token,
          expiresInSeconds,
          projectId,
          roomId,
          userId: resolvedUserId,
          role,
        },
      });
    },
  );
};
